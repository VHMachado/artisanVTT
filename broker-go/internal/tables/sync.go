package tables

import (
	"database/sql"
)

// changesPageLimit caps how many rows GET /sync returns per call so a
// client that's very far behind (or a fresh install) pages through history
// instead of one huge response. The client just calls again with the
// returned cursor until it stops advancing.
const changesPageLimit = 500

// GetChangesSince returns every change after `since`, each carrying the
// *current* snapshot of the entity it refers to ("data é o snapshot atual
// da linha, não um histórico") — so two changes for the same
// entity report the identical current data, which is fine, applying a
// snapshot by id is idempotent. cursor is the seq to pass next time; it
// only advances past rows actually returned.
func (s *Store) GetChangesSince(since int64) (changes []Change, cursor int64, serverTime int64, err error) {
	rows, err := s.db.Query(
		`SELECT seq, entity_type, entity_id, table_id, version, updated_at, deleted
		 FROM changes WHERE seq > ? ORDER BY seq ASC LIMIT ?`,
		since, changesPageLimit,
	)
	if err != nil {
		return nil, since, nowMillis(), err
	}
	defer rows.Close()

	type raw struct {
		seq                       int64
		entityType, entityID, tbl string
		version, updatedAt        int64
		deleted                   int
	}
	var raws []raw
	for rows.Next() {
		var r raw
		if err := rows.Scan(&r.seq, &r.entityType, &r.entityID, &r.tbl, &r.version, &r.updatedAt, &r.deleted); err != nil {
			return nil, since, nowMillis(), err
		}
		raws = append(raws, r)
	}
	if err := rows.Err(); err != nil {
		return nil, since, nowMillis(), err
	}

	cursor = since
	for _, r := range raws {
		var data interface{}
		if r.deleted == 0 {
			data, err = s.currentSnapshot(EntityType(r.entityType), r.entityID)
			if err != nil {
				return nil, since, nowMillis(), err
			}
		}
		changes = append(changes, Change{
			Seq:        r.seq,
			EntityType: EntityType(r.entityType),
			EntityID:   r.entityID,
			TableID:    r.tbl,
			Version:    r.version,
			UpdatedAt:  r.updatedAt,
			Deleted:    r.deleted != 0,
			Data:       data,
		})
		cursor = r.seq
	}
	return changes, cursor, nowMillis(), nil
}

// currentSnapshot fetches the live row for a change entry outside any
// transaction (a plain read, unlike getTableRow/getCharacterRow which take
// a *sql.Tx for the ApplyOp path).
func (s *Store) currentSnapshot(entityType EntityType, id string) (interface{}, error) {
	switch entityType {
	case EntityTable:
		var t TableRow
		var banner sql.NullString
		var deleted int
		row := s.db.QueryRow(
			`SELECT id, name, banner_asset_id, owner_id, created_at, updated_at, version, deleted
			 FROM tables WHERE id = ?`, id,
		)
		if err := row.Scan(&t.ID, &t.Name, &banner, &t.OwnerID, &t.CreatedAt, &t.UpdatedAt, &t.Version, &deleted); err != nil {
			if err == sql.ErrNoRows {
				return nil, nil
			}
			return nil, err
		}
		t.BannerAssetID = banner.String
		t.Deleted = deleted != 0
		return t, nil
	case EntityCharacter:
		var c CharacterRow
		var portrait, tokenAsset sql.NullString
		var owner sql.NullInt64
		var ownerDisplayName sql.NullString
		var deleted int
		row := s.db.QueryRow(
			`SELECT c.id, c.table_id, c.name, c.portrait_asset_id, c.token_asset_id, c.owner_account_id, c.sheet,
			        c.created_at, c.updated_at, c.version, c.deleted, a.display_name
			 FROM characters c LEFT JOIN accounts a ON a.id = c.owner_account_id
			 WHERE c.id = ?`, id,
		)
		if err := row.Scan(&c.ID, &c.TableID, &c.Name, &portrait, &tokenAsset, &owner, &c.Sheet,
			&c.CreatedAt, &c.UpdatedAt, &c.Version, &deleted, &ownerDisplayName); err != nil {
			if err == sql.ErrNoRows {
				return nil, nil
			}
			return nil, err
		}
		c.PortraitAssetID = portrait.String
		c.TokenAssetID = tokenAsset.String
		if owner.Valid {
			v := owner.Int64
			c.OwnerAccountID = &v
		}
		c.OwnerDisplayName = ownerDisplayName.String
		c.Deleted = deleted != 0
		return c, nil
	case EntityMonster:
		var m MonsterRow
		var parent, portrait sql.NullString
		var deleted int
		row := s.db.QueryRow(
			`SELECT id, table_id, name, parent_index, overrides, portrait_asset_id, token_asset_ids, owner_account_id,
			        created_at, updated_at, version, deleted
			 FROM monsters WHERE id = ?`, id,
		)
		if err := row.Scan(&m.ID, &m.TableID, &m.Name, &parent, &m.Overrides, &portrait, &m.TokenAssetIDs, &m.OwnerAccountID,
			&m.CreatedAt, &m.UpdatedAt, &m.Version, &deleted); err != nil {
			if err == sql.ErrNoRows {
				return nil, nil
			}
			return nil, err
		}
		m.ParentIndex = parent.String
		m.PortraitAssetID = portrait.String
		m.Deleted = deleted != 0
		return m, nil
	case EntityRuleOption:
		var o RuleOptionRow
		var ownerDisplayName sql.NullString
		var deleted int
		row := s.db.QueryRow(
			`SELECT o.id, o.table_id, o.kind, o.name, o.parent_index, o.payload, o.owner_account_id,
			        o.created_at, o.updated_at, o.version, o.deleted, a.display_name
			 FROM rule_options o LEFT JOIN accounts a ON a.id = o.owner_account_id
			 WHERE o.id = ?`, id,
		)
		if err := row.Scan(&o.ID, &o.TableID, &o.Kind, &o.Name, &o.ParentIndex, &o.Payload, &o.OwnerAccountID,
			&o.CreatedAt, &o.UpdatedAt, &o.Version, &deleted, &ownerDisplayName); err != nil {
			if err == sql.ErrNoRows {
				return nil, nil
			}
			return nil, err
		}
		o.OwnerDisplayName = ownerDisplayName.String
		o.Deleted = deleted != 0
		return o, nil
	default:
		return nil, nil
	}
}

// AssetExists reports whether an asset's bytes are already stored.
func (s *Store) AssetExists(hash string) (bool, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM assets WHERE hash = ?`, hash).Scan(&count)
	return count > 0, err
}

// RecordAsset upserts asset metadata after a successful upload.
func (s *Store) RecordAsset(hash, mime string, size int64) error {
	_, err := s.db.Exec(
		`INSERT INTO assets (hash, mime, size, created_at) VALUES (?, ?, ?, ?)
		 ON CONFLICT (hash) DO UPDATE SET mime = excluded.mime, size = excluded.size`,
		hash, mime, size, nowMillis(),
	)
	return err
}

// AssetMime looks up the stored mime type for an asset, "" if unknown.
func (s *Store) AssetMime(hash string) (string, error) {
	var mime string
	err := s.db.QueryRow(`SELECT mime FROM assets WHERE hash = ?`, hash).Scan(&mime)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return mime, err
}

// ResolveCharacterOwner implements game.TableAccess ("Permissões"): the
// current owner_account_id of a character, outside any
// transaction (a plain read, same as currentSnapshot above — the
// authorization check in hub.go runs on the hot path of every mapState
// update, not inside ApplyOp's transaction). ok is false for a
// deleted/unknown character, which the caller treats as "nothing to
// enforce" rather than a denial (see hub.go's authorizeMapStateUpdate).
func (s *Store) ResolveCharacterOwner(characterID string) (ownerAccountID *int64, ok bool, err error) {
	var owner sql.NullInt64
	var deleted int
	row := s.db.QueryRow(
		`SELECT owner_account_id, deleted FROM characters WHERE id = ?`, characterID,
	)
	if err := row.Scan(&owner, &deleted); err != nil {
		if err == sql.ErrNoRows {
			return nil, false, nil
		}
		return nil, false, err
	}
	if deleted != 0 {
		return nil, false, nil
	}
	if owner.Valid {
		v := owner.Int64
		return &v, true, nil
	}
	return nil, true, nil
}

// IsTableOwner implements game.TableAccess: whether accountID is tableID's
// owner_id (GM), who "Permissões" lets move/edit any
// character's token at their own table.
func (s *Store) IsTableOwner(tableID string, accountID int64) (bool, error) {
	var ownerID int64
	row := s.db.QueryRow(`SELECT owner_id FROM tables WHERE id = ? AND deleted = 0`, tableID)
	if err := row.Scan(&ownerID); err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, err
	}
	return ownerID == accountID, nil
}
