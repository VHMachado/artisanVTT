// Self check for the account store (SQLite-backed; see
// accounts.go's package comment). Run: go test ./internal/accounts/...
package accounts

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAccountsSelfCheck(t *testing.T) {
	dir := t.TempDir()
	a := New(dir)
	t.Cleanup(func() { a.Close() })
	ok, err := a.Register("gamemaster", "correct horse", "The GM")
	if err != nil || !ok {
		t.Fatalf("first register: ok=%v err=%v", ok, err)
	}
	ok, err = a.Register("gamemaster", "another", "Someone Else")
	if err != nil || ok {
		t.Fatalf("duplicate register should fail: ok=%v err=%v", ok, err)
	}

	// Only the right password logs in.
	if token, _, _, err := a.Login("gamemaster", "wrong"); err != nil || token != "" {
		t.Fatalf("wrong password should not log in: token=%q err=%v", token, err)
	}
	if token, _, _, err := a.Login("nobody", "correct horse"); err != nil || token != "" {
		t.Fatalf("unknown user should not log in: token=%q err=%v", token, err)
	}
	token, displayName, accountID, err := a.Login("gamemaster", "correct horse")
	if err != nil || token == "" {
		t.Fatalf("valid credentials should return a token: token=%q err=%v", token, err)
	}
	if displayName != "The GM" {
		t.Fatalf("login should return the display name: got %q", displayName)
	}
	if accountID == 0 {
		t.Fatalf("login should return a non-zero account id, got %d", accountID)
	}

	// Tokens resolve back to their owner, junk does not.
	if u, err := a.Verify(token); err != nil || u != "gamemaster" {
		t.Fatalf("verify valid token: user=%q err=%v", u, err)
	}
	if u, err := a.Verify("not-a-token"); err != nil || u != "" {
		t.Fatalf("verify junk token: user=%q err=%v", u, err)
	}
	if u, err := a.Verify(""); err != nil || u != "" {
		t.Fatalf("verify empty token: user=%q err=%v", u, err)
	}

	// Logging out invalidates the token.
	if err := a.Logout(token); err != nil {
		t.Fatalf("logout: %v", err)
	}
	if u, _ := a.Verify(token); u != "" {
		t.Fatalf("token should be invalid after logout, got user=%q", u)
	}

	// Two accounts never share a backup file.
	if _, err := a.Register("other", "correct horse", "Other Player"); err != nil {
		t.Fatalf("register other: %v", err)
	}
	if a.BackupPath("gamemaster") == a.BackupPath("other") {
		t.Fatal("backup paths must differ between accounts")
	}
	// Backups stay inside the data directory whatever the username looks like.
	if !strings.HasPrefix(a.BackupPath("../../etc/passwd"), filepath.Join(dir, "backups")) {
		t.Fatal("backup path must stay inside the data dir even for a malicious username")
	}

	// Credentials survive a restart.
	reloaded := New(dir)
	t.Cleanup(func() { reloaded.Close() })
	if token, _, _, err := reloaded.Login("gamemaster", "correct horse"); err != nil || token == "" {
		t.Fatalf("credentials should survive reload: token=%q err=%v", token, err)
	}

	// Password is never stored in the clear.
	onDisk, err := os.ReadFile(filepath.Join(dir, "artisan.db"))
	if err != nil {
		t.Fatalf("read artisan.db: %v", err)
	}
	if strings.Contains(string(onDisk), "correct horse") {
		t.Fatal("password must be hashed on disk")
	}
}

func TestAccountsMigratesLegacyJSON(t *testing.T) {
	dir := t.TempDir()
	// A pre-SQLite-migration accounts.json, shaped like the old file store produced.
	legacy := `{
		"gamemaster": {
			"username": "gamemaster",
			"hash": "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva",
			"tokens": {}
		}
	}`
	if err := os.WriteFile(filepath.Join(dir, "accounts.json"), []byte(legacy), 0o644); err != nil {
		t.Fatalf("seed legacy file: %v", err)
	}

	a := New(dir)
	t.Cleanup(func() { a.Close() })

	count, err := a.Count()
	if err != nil || count != 1 {
		t.Fatalf("legacy account should be imported: count=%d err=%v", count, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "accounts.json")); !os.IsNotExist(err) {
		t.Fatal("accounts.json should be renamed away after migration")
	}
	if _, err := os.Stat(filepath.Join(dir, "accounts.json.migrated")); err != nil {
		t.Fatal("accounts.json.migrated should exist after migration")
	}

	// Running New() again must not fail or double-import.
	a2 := New(dir)
	t.Cleanup(func() { a2.Close() })
	count2, err := a2.Count()
	if err != nil || count2 != 1 {
		t.Fatalf("second start should not re-import: count=%d err=%v", count2, err)
	}
}
