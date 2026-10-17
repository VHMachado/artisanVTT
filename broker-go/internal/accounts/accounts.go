// Package accounts is the account store: bcrypt hashes + bearer tokens,
// persisted in SQLite (DATA_DIR/artisan.db, WAL mode) via modernc.org/sqlite
// (pure Go, no cgo — the Alpine Dockerfile stays CGO_ENABLED=0).
//
// Originally this was a single accounts.json file rewritten whole on
// every mutation, ported straight from backend/src/entities/Accounts.ts.
// It was moved to SQLite because the tables feature (mesas, membros,
// personagens) adds relational data that a flat JSON blob has nowhere to
// grow into.
package accounts

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"

	"golang.org/x/crypto/bcrypt"
)

// isUniqueViolation reports whether err is a UNIQUE constraint failure.
// modernc.org/sqlite wraps the raw libsqlite3 error code/message; there is
// no typed sentinel, so match on the message the driver produces — cheaper
// than SELECTing for existence first on the common (non-conflicting) path.
func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}

const tokenTTL = 30 * 24 * time.Hour

// dummyHash is compared against when a username doesn't exist, so a bad
// username and a bad password take the same amount of time to reject.
const dummyHash = "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva"

const schema = `
CREATE TABLE IF NOT EXISTS accounts (
	id           INTEGER PRIMARY KEY AUTOINCREMENT,
	username     TEXT NOT NULL UNIQUE,
	display_name TEXT NOT NULL,
	hash         TEXT NOT NULL,
	created_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
	token      TEXT PRIMARY KEY,
	account_id INTEGER NOT NULL REFERENCES accounts(id),
	expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_account_id ON sessions(account_id);
`

// Accounts is safe for concurrent use — every method opens its own
// short-lived query against database/sql's own connection pool, and
// SQLite's WAL mode allows concurrent readers alongside a single writer.
type Accounts struct {
	dataDir string
	db      *sql.DB
}

// New opens (creating if needed) DATA_DIR/artisan.db. Panics on failure,
// same as the rest of main.go's startup sequence (there is no recovery
// path for "the data directory is unusable").
func New(dataDir string) *Accounts {
	if err := os.MkdirAll(filepath.Join(dataDir, "backups"), 0o755); err != nil {
		panic(fmt.Sprintf("accounts: creating data dir: %v", err))
	}
	dbPath := filepath.Join(dataDir, "artisan.db")
	db, err := sql.Open("sqlite", dbPath+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		panic(fmt.Sprintf("accounts: opening %s: %v", dbPath, err))
	}
	// SQLite only allows one writer at a time; a single connection avoids
	// SQLITE_BUSY under database/sql's default pooling for this small a
	// workload (a handful of GMs, not a public service).
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		panic(fmt.Sprintf("accounts: migrating schema: %v", err))
	}
	a := &Accounts{dataDir: dataDir, db: db}
	a.migrateLegacyJSON()
	return a
}

// migrateLegacyJSON imports accounts.json from the original flat-file
// store if one is still around, then renames it to .migrated so this only
// ever runs once. There is nothing real to migrate in practice (the
// fork's only accounts were lost before the SQLite migration), but the
// path needs to exist and be exercised.
func (a *Accounts) migrateLegacyJSON() {
	legacy := filepath.Join(a.dataDir, "accounts.json")
	data, err := os.ReadFile(legacy)
	if err != nil {
		return // nothing to migrate
	}
	var parsed map[string]struct {
		Username string           `json:"username"`
		Hash     string           `json:"hash"`
		Tokens   map[string]int64 `json:"tokens"`
	}
	if err := json.Unmarshal(data, &parsed); err == nil {
		now := time.Now().UnixMilli()
		for username, acct := range parsed {
			res, err := a.db.Exec(
				`INSERT OR IGNORE INTO accounts (username, display_name, hash, created_at) VALUES (?, ?, ?, ?)`,
				username, username, acct.Hash, now,
			)
			if err != nil {
				continue
			}
			id, err := res.LastInsertId()
			if err != nil || id == 0 {
				continue
			}
			for token, expiry := range acct.Tokens {
				if expiry > now {
					a.db.Exec(`INSERT OR IGNORE INTO sessions (token, account_id, expires_at) VALUES (?, ?, ?)`, token, id, expiry)
				}
			}
		}
	}
	os.Rename(legacy, legacy+".migrated")
}

// Close releases the underlying SQLite connection. Mainly for tests: on
// Windows an open connection keeps t.TempDir() from deleting the database
// file during cleanup.
func (a *Accounts) Close() error {
	return a.db.Close()
}

func randomToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// Register creates a new account with a display name. Returns false if the
// username is taken.
func (a *Accounts) Register(username, password, displayName string) (bool, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return false, err
	}
	_, err = a.db.Exec(
		`INSERT INTO accounts (username, display_name, hash, created_at) VALUES (?, ?, ?, ?)`,
		username, displayName, string(hash), time.Now().UnixMilli(),
	)
	if err != nil {
		if isUniqueViolation(err) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (a *Accounts) Count() (int, error) {
	var count int
	err := a.db.QueryRow(`SELECT COUNT(*) FROM accounts`).Scan(&count)
	return count, err
}

// Login verifies credentials and issues a session token, or "" if invalid.
// The returned displayName/accountID are only meaningful when the token is
// non-empty. accountID lets the client know its own numeric id for local
// ownership bookkeeping in the outbox — the server still re-verifies every
// write server-side, this is purely for optimistic UI.
func (a *Accounts) Login(username, password string) (token string, displayName string, accountID int64, err error) {
	var id int64
	var hash string
	row := a.db.QueryRow(`SELECT id, hash, display_name FROM accounts WHERE username = ?`, username)
	scanErr := row.Scan(&id, &hash, &displayName)
	exists := scanErr == nil
	compareHash := dummyHash
	if exists {
		compareHash = hash
	}
	// Always run the compare, even for a missing account, to keep timing
	// consistent between "bad username" and "bad password".
	cmpErr := bcrypt.CompareHashAndPassword([]byte(compareHash), []byte(password))
	if !exists || cmpErr != nil {
		return "", "", 0, nil
	}

	newToken, err := randomToken()
	if err != nil {
		return "", "", 0, err
	}
	expiresAt := time.Now().Add(tokenTTL).UnixMilli()
	if _, err := a.db.Exec(
		`INSERT INTO sessions (token, account_id, expires_at) VALUES (?, ?, ?)`,
		newToken, id, expiresAt,
	); err != nil {
		return "", "", 0, err
	}
	// Sweep this account's own expired tokens opportunistically, mirroring
	// the old JSON store's per-login cleanup without a global background
	// job.
	a.db.Exec(`DELETE FROM sessions WHERE account_id = ? AND expires_at < ?`, id, time.Now().UnixMilli())
	return newToken, displayName, id, nil
}

// Verify resolves a bearer token to a username, or "" if unknown/expired.
func (a *Accounts) Verify(token string) (string, error) {
	if token == "" {
		return "", nil
	}
	var username string
	row := a.db.QueryRow(
		`SELECT accounts.username FROM sessions
		 JOIN accounts ON accounts.id = sessions.account_id
		 WHERE sessions.token = ? AND sessions.expires_at > ?`,
		token, time.Now().UnixMilli(),
	)
	err := row.Scan(&username)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return username, nil
}

// Account identifies a logged in caller for the tables/sync API, which
// needs the numeric account id (owner_id / owner_account_id foreign
// keys), not just the username Verify returns.
type Account struct {
	ID          int64
	Username    string
	DisplayName string
}

// VerifyAccount is Verify plus the numeric id, used wherever a mutation
// needs to stamp an authenticated owner server-side (ownership is always
// stamped by the server, never accepted from the client).
func (a *Accounts) VerifyAccount(token string) (Account, bool, error) {
	if token == "" {
		return Account{}, false, nil
	}
	var acct Account
	row := a.db.QueryRow(
		`SELECT accounts.id, accounts.username, accounts.display_name FROM sessions
		 JOIN accounts ON accounts.id = sessions.account_id
		 WHERE sessions.token = ? AND sessions.expires_at > ?`,
		token, time.Now().UnixMilli(),
	)
	err := row.Scan(&acct.ID, &acct.Username, &acct.DisplayName)
	if err == sql.ErrNoRows {
		return Account{}, false, nil
	}
	if err != nil {
		return Account{}, false, err
	}
	return acct, true, nil
}

func (a *Accounts) Logout(token string) error {
	_, err := a.db.Exec(`DELETE FROM sessions WHERE token = ?`, token)
	return err
}

// BackupPath is the path of the backup blob for an account. Usernames are
// validated on registration, but hashed anyway so nothing a user types can
// ever escape the backups directory.
func (a *Accounts) BackupPath(username string) string {
	sum := sha256.Sum256([]byte(username))
	safe := hex.EncodeToString(sum[:])
	return filepath.Join(a.dataDir, "backups", fmt.Sprintf("%s.owlbear", safe))
}
