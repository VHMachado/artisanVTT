// Package tables is the shared-content store: Mesas (tables),
// membership and Personagens (characters), plus the changes log that backs
// the pull-by-cursor sync protocol.
//
// Opens its own *sql.DB handle onto the same DATA_DIR/artisan.db file that
// internal/accounts uses, rather than sharing accounts.Accounts' handle —
// each package owning its own handle keeps them independently testable
// without a shared SQLite connection to coordinate.
package tables

import (
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS accounts (
	id           INTEGER PRIMARY KEY AUTOINCREMENT,
	username     TEXT NOT NULL UNIQUE,
	display_name TEXT NOT NULL,
	hash         TEXT NOT NULL,
	created_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tables (
	id              TEXT PRIMARY KEY,
	name            TEXT NOT NULL,
	banner_asset_id TEXT,
	owner_id        INTEGER NOT NULL,
	created_at      INTEGER NOT NULL,
	updated_at      INTEGER NOT NULL,
	version         INTEGER NOT NULL DEFAULT 0,
	deleted         INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS table_members (
	table_id   TEXT NOT NULL,
	account_id INTEGER NOT NULL,
	role       TEXT NOT NULL,
	PRIMARY KEY (table_id, account_id)
);
CREATE TABLE IF NOT EXISTS characters (
	id                TEXT PRIMARY KEY,
	table_id          TEXT NOT NULL,
	name              TEXT NOT NULL,
	portrait_asset_id TEXT,
	token_asset_id    TEXT,
	owner_account_id  INTEGER,
	sheet             TEXT NOT NULL DEFAULT '{}',
	created_at        INTEGER NOT NULL,
	updated_at        INTEGER NOT NULL,
	version           INTEGER NOT NULL DEFAULT 0,
	deleted           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS characters_table_id ON characters(table_id);
CREATE TABLE IF NOT EXISTS monsters (
	id                TEXT PRIMARY KEY,
	table_id          TEXT NOT NULL,
	name              TEXT NOT NULL,
	parent_index      TEXT,
	overrides         TEXT NOT NULL DEFAULT '{}',
	portrait_asset_id TEXT,
	token_asset_ids   TEXT NOT NULL DEFAULT '[]',
	owner_account_id  INTEGER NOT NULL,
	created_at        INTEGER NOT NULL,
	updated_at        INTEGER NOT NULL,
	version           INTEGER NOT NULL DEFAULT 0,
	deleted           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS monsters_table_id ON monsters(table_id);
CREATE TABLE IF NOT EXISTS rule_options (
	id               TEXT PRIMARY KEY,
	table_id         TEXT NOT NULL,
	kind             TEXT NOT NULL,
	name             TEXT NOT NULL,
	parent_index     TEXT NOT NULL,
	payload          TEXT NOT NULL DEFAULT '{}',
	owner_account_id INTEGER NOT NULL,
	created_at       INTEGER NOT NULL,
	updated_at       INTEGER NOT NULL,
	version          INTEGER NOT NULL DEFAULT 0,
	deleted          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS rule_options_table_id ON rule_options(table_id);
CREATE TABLE IF NOT EXISTS assets (
	hash       TEXT PRIMARY KEY,
	mime       TEXT NOT NULL,
	size       INTEGER NOT NULL,
	width      INTEGER,
	height     INTEGER,
	created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS changes (
	seq         INTEGER PRIMARY KEY AUTOINCREMENT,
	entity_type TEXT NOT NULL,
	entity_id   TEXT NOT NULL,
	table_id    TEXT NOT NULL,
	version     INTEGER NOT NULL,
	updated_at  INTEGER NOT NULL,
	deleted     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS changes_seq ON changes(seq);
`

// Store is safe for concurrent use, same reasoning as accounts.Accounts:
// database/sql's own pool plus SQLite WAL mode.
//
// schema's accounts table mirrors internal/accounts.go's DDL exactly and
// is guarded by IF NOT EXISTS: in production accounts.New always runs
// first, so this is a no-op there, but it makes a bare tables.Store (as
// used by ops_test.go, which never constructs accounts.Accounts) able to
// satisfy the ownerDisplayName JOIN in getCharacterRow/currentSnapshot
// without requiring every test to also stand up the accounts package.
type Store struct {
	dataDir   string
	assetsDir string
	db        *sql.DB
}

// New opens (creating if needed) DATA_DIR/artisan.db — the same file
// internal/accounts.New created — and ensures the tables schema exists.
// Panics on failure, matching accounts.New's startup contract.
func New(dataDir string) *Store {
	assetsDir := filepath.Join(dataDir, "assets")
	if err := os.MkdirAll(assetsDir, 0o755); err != nil {
		panic(fmt.Sprintf("tables: creating assets dir: %v", err))
	}
	dbPath := filepath.Join(dataDir, "artisan.db")
	db, err := sql.Open("sqlite", dbPath+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		panic(fmt.Sprintf("tables: opening %s: %v", dbPath, err))
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		panic(fmt.Sprintf("tables: migrating schema: %v", err))
	}
	if err := addMissingColumns(db); err != nil {
		panic(fmt.Sprintf("tables: migrating columns: %v", err))
	}
	return &Store{dataDir: dataDir, assetsDir: assetsDir, db: db}
}

// addMissingColumns adds columns introduced after a table's original
// CREATE TABLE IF NOT EXISTS — that statement is a no-op against an
// existing table on disk (e.g. a `monsters` table already deployed
// before this column existed), so a NEW column needs an explicit ALTER
// TABLE, run once per column and skipped if it's already there (checked
// via PRAGMA table_info rather than a blind ALTER + ignored error, since
// SQLite's "duplicate column name" error has no stable code to match
// against in modernc.org/sqlite).
func addMissingColumns(db *sql.DB) error {
	additions := []struct {
		table, column, ddl string
	}{
		// Per-monster portrait + token variants (art the GM uploads
		// for a homebrew/derived creature; the vendored SRD bestiary
		// itself stays image-less).
		{"monsters", "portrait_asset_id", "TEXT"},
		{"monsters", "token_asset_ids", "TEXT NOT NULL DEFAULT '[]'"},
	}
	for _, a := range additions {
		has, err := hasColumn(db, a.table, a.column)
		if err != nil {
			return err
		}
		if has {
			continue
		}
		if _, err := db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", a.table, a.column, a.ddl)); err != nil {
			return err
		}
	}
	return nil
}

func hasColumn(db *sql.DB, table, column string) (bool, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull, pk int
		var dfltValue interface{}
		if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk); err != nil {
			return false, err
		}
		if name == column {
			return true, nil
		}
	}
	return false, rows.Err()
}

func (s *Store) Close() error {
	return s.db.Close()
}

func nowMillis() int64 {
	return time.Now().UnixMilli()
}

// AssetPath returns the on-disk path for a content-addressed asset, sharded
// by the first two hex characters of the hash so a single directory never
// holds thousands of files.
func (s *Store) AssetPath(hash string) (string, error) {
	if len(hash) < 2 {
		return "", fmt.Errorf("invalid asset hash %q", hash)
	}
	if _, err := hex.DecodeString(hash); err != nil {
		return "", fmt.Errorf("invalid asset hash %q: %w", hash, err)
	}
	return filepath.Join(s.assetsDir, hash[:2], hash), nil
}
