// Adding portrait_asset_id/token_asset_ids to an EXISTING `monsters` table
// requires more than CREATE TABLE IF NOT EXISTS, which is a no-op against
// a table that's already on disk — this exercises the ALTER TABLE path
// (addMissingColumns) against a database seeded with the OLD pre-migration
// schema, the same shape a long-lived deployment's artisan.db would have.
package tables

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func TestNewMigratesAnExistingMonstersTableMissingArtColumns(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "artisan.db")

	// Seed a database with the pre-12f `monsters` schema (no portrait/token
	// columns) plus one existing row, mirroring what's actually deployed.
	seed, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("seed open: %v", err)
	}
	if _, err := seed.Exec(`
		CREATE TABLE monsters (
			id               TEXT PRIMARY KEY,
			table_id         TEXT NOT NULL,
			name             TEXT NOT NULL,
			parent_index     TEXT,
			overrides        TEXT NOT NULL DEFAULT '{}',
			owner_account_id INTEGER NOT NULL,
			created_at       INTEGER NOT NULL,
			updated_at       INTEGER NOT NULL,
			version          INTEGER NOT NULL DEFAULT 0,
			deleted          INTEGER NOT NULL DEFAULT 0
		);
		CREATE TABLE tables (
			id              TEXT PRIMARY KEY,
			name            TEXT NOT NULL,
			banner_asset_id TEXT,
			owner_id        INTEGER NOT NULL,
			created_at      INTEGER NOT NULL,
			updated_at      INTEGER NOT NULL,
			version         INTEGER NOT NULL DEFAULT 0,
			deleted         INTEGER NOT NULL DEFAULT 0
		);
		INSERT INTO tables (id, name, owner_id, created_at, updated_at, version, deleted)
		VALUES ('t1', 'Mesa Pré-existente', 1, 0, 0, 1, 0);
		INSERT INTO monsters (id, table_id, name, owner_account_id, created_at, updated_at, version, deleted)
		VALUES ('m1', 't1', 'Pré-existente', 1, 0, 0, 1, 0);
	`); err != nil {
		t.Fatalf("seed schema: %v", err)
	}
	if err := seed.Close(); err != nil {
		t.Fatalf("seed close: %v", err)
	}

	// New() must migrate the existing table in place without panicking and
	// without losing the pre-existing row.
	s := New(dir)
	defer s.Close()

	row, err := readMonsterRow(t, s, "m1")
	if err != nil {
		t.Fatalf("getMonsterRow after migration: %v", err)
	}
	if row == nil {
		t.Fatal("pre-existing row should survive the migration")
	}
	if row.Name != "Pré-existente" {
		t.Fatalf("pre-existing row's data should be intact, got name=%q", row.Name)
	}
	if row.PortraitAssetID != "" {
		t.Fatalf("a migrated old row should have no portrait, got %q", row.PortraitAssetID)
	}
	if row.TokenAssetIDs != "[]" {
		t.Fatalf("a migrated old row should default tokenAssetIds to '[]', got %q", row.TokenAssetIDs)
	}

	// The new columns are now writable through the normal op path.
	if _, outcome, err := s.ApplyOp(1, Op{
		EntityType: EntityMonster, ID: "m1", BaseVersion: 1,
		Patch: map[string]interface{}{"portraitAssetId": "abcd"},
	}); err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("edit after migration: %s %v", outcome, err)
	}
}

// readMonsterRow begins its own transaction, reads and closes it right
// away — the Store's single-connection pool (SetMaxOpenConns(1)) means an
// open *sql.Tx held past the call would deadlock any subsequent ApplyOp,
// which also needs that one connection to Begin its own transaction.
func readMonsterRow(t *testing.T, s *Store, id string) (*MonsterRow, error) {
	t.Helper()
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	return getMonsterRow(tx, id)
}
