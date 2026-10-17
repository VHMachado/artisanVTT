package tables

import (
	"database/sql"
	"encoding/json"
	"fmt"
)

// resultAccepted/Conflict/Rejected are the three outcomes ApplyOp can
// produce for a single op, matching the three-way split used for sync
// (version
// conflict vs. authorization failure are NOT the same thing: only the
// former is something the client can recover from by resyncing).
type opOutcome string

const (
	outcomeAccepted opOutcome = "accepted"
	outcomeConflict opOutcome = "conflict"
	outcomeRejected opOutcome = "rejected"
)

// getTableRow reads a Mesa row inside tx, nil if it doesn't exist (not an
// error — that's the "create" case for ApplyOp).
func getTableRow(tx *sql.Tx, id string) (*TableRow, error) {
	var t TableRow
	var banner sql.NullString
	row := tx.QueryRow(
		`SELECT id, name, banner_asset_id, owner_id, created_at, updated_at, version, deleted
		 FROM tables WHERE id = ?`, id,
	)
	var deleted int
	if err := row.Scan(&t.ID, &t.Name, &banner, &t.OwnerID, &t.CreatedAt, &t.UpdatedAt, &t.Version, &deleted); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	t.BannerAssetID = banner.String
	t.Deleted = deleted != 0
	return &t, nil
}

func getCharacterRow(tx *sql.Tx, id string) (*CharacterRow, error) {
	var c CharacterRow
	var portrait, tokenAsset sql.NullString
	var owner sql.NullInt64
	var ownerDisplayName sql.NullString
	row := tx.QueryRow(
		`SELECT c.id, c.table_id, c.name, c.portrait_asset_id, c.token_asset_id, c.owner_account_id, c.sheet,
		        c.created_at, c.updated_at, c.version, c.deleted, a.display_name
		 FROM characters c LEFT JOIN accounts a ON a.id = c.owner_account_id
		 WHERE c.id = ?`, id,
	)
	var deleted int
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
	return &c, nil
}

func recordChange(tx *sql.Tx, entityType EntityType, entityID, tableID string, version, updatedAt int64, deleted bool) error {
	deletedInt := 0
	if deleted {
		deletedInt = 1
	}
	_, err := tx.Exec(
		`INSERT INTO changes (entity_type, entity_id, table_id, version, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?)`,
		string(entityType), entityID, tableID, version, updatedAt, deletedInt,
	)
	return err
}

func stringFromPatch(patch map[string]interface{}, key, fallback string) string {
	if v, ok := patch[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return fallback
}

// applyTableOp handles a single "table" op inside tx. The authorization
// rule in tables: create is open to any authenticated
// caller (who becomes owner_id, stamped server-side); edit/delete requires
// the caller to already be owner_id.
func (s *Store) applyTableOp(tx *sql.Tx, callerID int64, op Op) (OpResult, opOutcome, error) {
	now := nowMillis()
	current, err := getTableRow(tx, op.ID)
	if err != nil {
		return OpResult{}, outcomeRejected, err
	}

	if current == nil {
		// Create path: only valid if the client computed this against "no
		// row yet" (baseVersion 0). Anything else is a conflict against an
		// entity that doesn't exist (e.g. it was deleted upstream and the
		// client doesn't know yet).
		if op.BaseVersion != 0 {
			return OpResult{ID: op.ID, Version: 0, Canonical: nil}, outcomeConflict, nil
		}
		name := stringFromPatch(op.Patch, "name", "")
		if name == "" {
			return OpResult{ID: op.ID, Error: "table name is required"}, outcomeRejected, nil
		}
		banner := stringFromPatch(op.Patch, "bannerAssetId", "")
		var bannerVal interface{}
		if banner != "" {
			bannerVal = banner
		}
		if _, err := tx.Exec(
			`INSERT INTO tables (id, name, banner_asset_id, owner_id, created_at, updated_at, version, deleted)
			 VALUES (?, ?, ?, ?, ?, ?, 1, 0)`,
			op.ID, name, bannerVal, callerID, now, now,
		); err != nil {
			return OpResult{}, outcomeRejected, err
		}
		// Creator becomes gm, in the same transaction ("Entrar
		// numa Mesa é automático" trigger 1).
		if _, err := tx.Exec(
			`INSERT INTO table_members (table_id, account_id, role) VALUES (?, ?, 'gm')
			 ON CONFLICT (table_id, account_id) DO UPDATE SET role = 'gm'`,
			op.ID, callerID,
		); err != nil {
			return OpResult{}, outcomeRejected, err
		}
		if err := recordChange(tx, EntityTable, op.ID, op.ID, 1, now, false); err != nil {
			return OpResult{}, outcomeRejected, err
		}
		return OpResult{ID: op.ID, Version: 1}, outcomeAccepted, nil
	}

	// Edit/delete path: owner only.
	if current.OwnerID != callerID {
		return OpResult{ID: op.ID, Error: "only the table's owner can edit it"}, outcomeRejected, nil
	}
	if op.BaseVersion != current.Version {
		return OpResult{ID: op.ID, Version: current.Version, Canonical: current}, outcomeConflict, nil
	}

	newVersion := current.Version + 1
	if op.Deleted {
		if _, err := tx.Exec(`UPDATE tables SET deleted = 1, version = ?, updated_at = ? WHERE id = ?`, newVersion, now, op.ID); err != nil {
			return OpResult{}, outcomeRejected, err
		}
		if err := recordChange(tx, EntityTable, op.ID, op.ID, newVersion, now, true); err != nil {
			return OpResult{}, outcomeRejected, err
		}
		return OpResult{ID: op.ID, Version: newVersion}, outcomeAccepted, nil
	}

	name := stringFromPatch(op.Patch, "name", current.Name)
	banner := stringFromPatch(op.Patch, "bannerAssetId", current.BannerAssetID)
	var bannerVal interface{}
	if banner != "" {
		bannerVal = banner
	}
	if _, err := tx.Exec(
		`UPDATE tables SET name = ?, banner_asset_id = ?, version = ?, updated_at = ? WHERE id = ?`,
		name, bannerVal, newVersion, now, op.ID,
	); err != nil {
		return OpResult{}, outcomeRejected, err
	}
	if err := recordChange(tx, EntityTable, op.ID, op.ID, newVersion, now, false); err != nil {
		return OpResult{}, outcomeRejected, err
	}
	return OpResult{ID: op.ID, Version: newVersion}, outcomeAccepted, nil
}

// applyCharacterOp handles a single "character" op inside tx. The
// authorization rule in characters follows the same shape as tables'.
func (s *Store) applyCharacterOp(tx *sql.Tx, callerID int64, op Op) (OpResult, opOutcome, error) {
	now := nowMillis()
	current, err := getCharacterRow(tx, op.ID)
	if err != nil {
		return OpResult{}, outcomeRejected, err
	}

	// tableOwnerID resolves who owns the Mesa this character belongs (or
	// would belong) to, needed for the "GM can touch any character of
	// their table" rule.
	tableID := ""
	if current != nil {
		tableID = current.TableID
	} else if v, ok := op.Patch["tableId"].(string); ok {
		tableID = v
	}
	if tableID == "" {
		return OpResult{ID: op.ID, Error: "tableId is required"}, outcomeRejected, nil
	}
	table, err := getTableRow(tx, tableID)
	if err != nil {
		return OpResult{}, outcomeRejected, err
	}
	if table == nil {
		return OpResult{ID: op.ID, Error: "unknown table"}, outcomeRejected, nil
	}
	isTableOwner := table.OwnerID == callerID

	// Resolve the requested owner_account_id from the patch: null clears
	// it, absent keeps the current value (or nil on create), a number
	// assigns it.
	requestedOwner, ownerInPatch := resolveOwnerAccountID(op.Patch, current)

	if current == nil {
		if op.BaseVersion != 0 {
			return OpResult{ID: op.ID, Version: 0, Canonical: nil}, outcomeConflict, nil
		}
		name := stringFromPatch(op.Patch, "name", "")
		if name == "" {
			return OpResult{ID: op.ID, Error: "character name is required"}, outcomeRejected, nil
		}
		// Creating with no explicit owner is always fine (unowned,
		// adoptable later). Assigning an owner other than the caller
		// requires being the table's GM.
		if ownerInPatch && requestedOwner != nil && *requestedOwner != callerID && !isTableOwner {
			return OpResult{ID: op.ID, Error: "only the table's owner can assign a character to another account"}, outcomeRejected, nil
		}
		// The table's GM cannot claim a character for themselves, on
		// create or later (see the mirrored check below in the
		// edit/delete path). A GM already has full move/edit rights over
		// every character at the table ("Mestre move e edita
		// todos") without owning one — letting them also self-assign
		// would blur "GM acting on someone's behalf" with "GM playing a
		// PC", which the role model keeps separate.
		if ownerInPatch && requestedOwner != nil && *requestedOwner == callerID && isTableOwner {
			return OpResult{ID: op.ID, Error: "the table's owner cannot assign a character to themselves"}, outcomeRejected, nil
		}
		portrait := stringFromPatch(op.Patch, "portraitAssetId", "")
		tokenAsset := stringFromPatch(op.Patch, "tokenAssetId", "")
		sheet := stringFromPatch(op.Patch, "sheet", "{}")
		if _, err := tx.Exec(
			`INSERT INTO characters (id, table_id, name, portrait_asset_id, token_asset_id, owner_account_id, sheet, created_at, updated_at, version, deleted)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
			op.ID, tableID, name, nullableString(portrait), nullableString(tokenAsset), nullableInt64(requestedOwner), sheet, now, now,
		); err != nil {
			return OpResult{}, outcomeRejected, err
		}
		if err := recordChange(tx, EntityCharacter, op.ID, tableID, 1, now, false); err != nil {
			return OpResult{}, outcomeRejected, err
		}
		return OpResult{ID: op.ID, Version: 1}, outcomeAccepted, nil
	}

	// The version guard applies before authorization: a stale
	// baseVersion means the caller's view of this character predates whatever the
	// current row reflects (including its current owner), so there is
	// nothing meaningful to authorize against yet — resync them with the
	// canonical state first (this is exactly how "primeiro a
	// chegar ganha" falls out of the version guard for character
	// adoption, rather than a bespoke race check).
	if op.BaseVersion != current.Version {
		return OpResult{ID: op.ID, Version: current.Version, Canonical: current}, outcomeConflict, nil
	}

	// Edit/delete authorization: the table's owner can touch anything;
	// otherwise the caller may only touch a character currently unowned or
	// owned by themselves.
	currentlyMine := current.OwnerAccountID == nil || *current.OwnerAccountID == callerID
	if !isTableOwner && !currentlyMine {
		return OpResult{ID: op.ID, Error: "you do not own this character"}, outcomeRejected, nil
	}
	// Reassigning ownership to someone else requires being the GM.
	if ownerInPatch && requestedOwner != nil && *requestedOwner != callerID && !isTableOwner {
		return OpResult{ID: op.ID, Error: "only the table's owner can assign a character to another account"}, outcomeRejected, nil
	}
	// The table's GM cannot assign a character to themselves either —
	// mirrors the create-path check above.
	if ownerInPatch && requestedOwner != nil && *requestedOwner == callerID && isTableOwner {
		return OpResult{ID: op.ID, Error: "the table's owner cannot assign a character to themselves"}, outcomeRejected, nil
	}

	newVersion := current.Version + 1
	if op.Deleted {
		if _, err := tx.Exec(`UPDATE characters SET deleted = 1, version = ?, updated_at = ? WHERE id = ?`, newVersion, now, op.ID); err != nil {
			return OpResult{}, outcomeRejected, err
		}
		if err := recordChange(tx, EntityCharacter, op.ID, tableID, newVersion, now, true); err != nil {
			return OpResult{}, outcomeRejected, err
		}
		return OpResult{ID: op.ID, Version: newVersion}, outcomeAccepted, nil
	}

	name := stringFromPatch(op.Patch, "name", current.Name)
	portrait := stringFromPatch(op.Patch, "portraitAssetId", current.PortraitAssetID)
	tokenAsset := stringFromPatch(op.Patch, "tokenAssetId", current.TokenAssetID)
	sheet := stringFromPatch(op.Patch, "sheet", current.Sheet)
	if _, err := tx.Exec(
		`UPDATE characters SET name = ?, portrait_asset_id = ?, token_asset_id = ?, owner_account_id = ?, sheet = ?, version = ?, updated_at = ? WHERE id = ?`,
		name, nullableString(portrait), nullableString(tokenAsset), nullableInt64(requestedOwner), sheet, newVersion, now, op.ID,
	); err != nil {
		return OpResult{}, outcomeRejected, err
	}
	if err := recordChange(tx, EntityCharacter, op.ID, tableID, newVersion, now, false); err != nil {
		return OpResult{}, outcomeRejected, err
	}
	return OpResult{ID: op.ID, Version: newVersion}, outcomeAccepted, nil
}

// getMonsterRow reads a homebrew/derived creature inside tx, nil
// if it doesn't exist (the "create" case for ApplyOp).
func getMonsterRow(tx *sql.Tx, id string) (*MonsterRow, error) {
	var m MonsterRow
	var parent, portrait sql.NullString
	var deleted int
	row := tx.QueryRow(
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
	return &m, nil
}

// applyMonsterOp handles a single "monster" op inside tx: create a
// monster/NPC from scratch or derived from an existing one, with a
// derived creature tied to its parent monster.
//
// Authorization is simpler than a character's and deliberately stricter:
// only the Mesa's owner (GM) may create, edit or delete one. A Mesa's
// bestiary is shared reference material that every player at the table
// reads, so letting any member author entries would let one player rewrite
// what everyone else sees — whereas a character is that player's own. The
// author is recorded in owner_account_id for provenance but is never what
// grants the edit right (and is never reassigned), so a Mesa that changes
// hands doesn't leave its monsters editable by the previous GM.
func (s *Store) applyMonsterOp(tx *sql.Tx, callerID int64, op Op) (OpResult, opOutcome, error) {
	now := nowMillis()
	current, err := getMonsterRow(tx, op.ID)
	if err != nil {
		return OpResult{}, outcomeRejected, err
	}

	tableID := ""
	if current != nil {
		tableID = current.TableID
	} else if v, ok := op.Patch["tableId"].(string); ok {
		tableID = v
	}
	if tableID == "" {
		return OpResult{ID: op.ID, Error: "tableId is required"}, outcomeRejected, nil
	}
	table, err := getTableRow(tx, tableID)
	if err != nil {
		return OpResult{}, outcomeRejected, err
	}
	if table == nil {
		return OpResult{ID: op.ID, Error: "unknown table"}, outcomeRejected, nil
	}
	if table.OwnerID != callerID {
		return OpResult{ID: op.ID, Error: "only the table's owner can manage its monsters"}, outcomeRejected, nil
	}

	if current == nil {
		if op.BaseVersion != 0 {
			return OpResult{ID: op.ID, Version: 0, Canonical: nil}, outcomeConflict, nil
		}
		name := stringFromPatch(op.Patch, "name", "")
		if name == "" {
			return OpResult{ID: op.ID, Error: "monster name is required"}, outcomeRejected, nil
		}
		parentIndex := stringFromPatch(op.Patch, "parentIndex", "")
		overrides := stringFromPatch(op.Patch, "overrides", "{}")
		portrait := stringFromPatch(op.Patch, "portraitAssetId", "")
		tokenAssetIDs := stringFromPatch(op.Patch, "tokenAssetIds", "[]")
		if _, err := tx.Exec(
			`INSERT INTO monsters (id, table_id, name, parent_index, overrides, portrait_asset_id, token_asset_ids, owner_account_id, created_at, updated_at, version, deleted)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
			op.ID, tableID, name, nullableString(parentIndex), overrides, nullableString(portrait), tokenAssetIDs, callerID, now, now,
		); err != nil {
			return OpResult{}, outcomeRejected, err
		}
		if err := recordChange(tx, EntityMonster, op.ID, tableID, 1, now, false); err != nil {
			return OpResult{}, outcomeRejected, err
		}
		return OpResult{ID: op.ID, Version: 1}, outcomeAccepted, nil
	}

	if op.BaseVersion != current.Version {
		return OpResult{ID: op.ID, Version: current.Version, Canonical: current}, outcomeConflict, nil
	}

	newVersion := current.Version + 1
	if op.Deleted {
		if _, err := tx.Exec(`UPDATE monsters SET deleted = 1, version = ?, updated_at = ? WHERE id = ?`, newVersion, now, op.ID); err != nil {
			return OpResult{}, outcomeRejected, err
		}
		if err := recordChange(tx, EntityMonster, op.ID, tableID, newVersion, now, true); err != nil {
			return OpResult{}, outcomeRejected, err
		}
		return OpResult{ID: op.ID, Version: newVersion}, outcomeAccepted, nil
	}

	name := stringFromPatch(op.Patch, "name", current.Name)
	overrides := stringFromPatch(op.Patch, "overrides", current.Overrides)
	portrait := stringFromPatch(op.Patch, "portraitAssetId", current.PortraitAssetID)
	tokenAssetIDs := stringFromPatch(op.Patch, "tokenAssetIds", current.TokenAssetIDs)
	// parent_index is fixed at creation: re-parenting a derived creature
	// would silently reinterpret every stored override against a different
	// base stat block (a Duergar's "+2 HP" means nothing on an Ancient Red
	// Dragon). Deriving from a different parent is a new monster.
	if _, err := tx.Exec(
		`UPDATE monsters SET name = ?, overrides = ?, portrait_asset_id = ?, token_asset_ids = ?, version = ?, updated_at = ? WHERE id = ?`,
		name, overrides, nullableString(portrait), tokenAssetIDs, newVersion, now, op.ID,
	); err != nil {
		return OpResult{}, outcomeRejected, err
	}
	if err := recordChange(tx, EntityMonster, op.ID, tableID, newVersion, now, false); err != nil {
		return OpResult{}, outcomeRejected, err
	}
	return OpResult{ID: op.ID, Version: newVersion}, outcomeAccepted, nil
}

// getRuleOptionRow reads a homebrew subrace/subclass inside tx,
// nil if it doesn't exist (the "create" case for ApplyOp).
func getRuleOptionRow(tx *sql.Tx, id string) (*RuleOptionRow, error) {
	var o RuleOptionRow
	var ownerDisplayName sql.NullString
	var deleted int
	row := tx.QueryRow(
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
	return &o, nil
}

// applyRuleOptionOp handles a single "rule_option" op inside tx — a
// homebrew subrace/subclass.
//
// Authorization sits deliberately between a character's and a monster's:
// any MEMBER of the Mesa may create one (a player writing up the Drow
// lineage their character uses shouldn't have to queue behind the GM), the
// AUTHOR may edit or delete their own, and the Mesa's GM may edit or
// delete any — the same "Mestre move e edita todos" rule characters
// already follow. That is the "Mestre e jogadores, cada um no que é seu"
// the user asked for, and the reason owner_account_id here grants rights
// (unlike a monster's, which only records provenance).
func (s *Store) applyRuleOptionOp(tx *sql.Tx, callerID int64, op Op) (OpResult, opOutcome, error) {
	now := nowMillis()
	current, err := getRuleOptionRow(tx, op.ID)
	if err != nil {
		return OpResult{}, outcomeRejected, err
	}

	tableID := ""
	if current != nil {
		tableID = current.TableID
	} else if v, ok := op.Patch["tableId"].(string); ok {
		tableID = v
	}
	if tableID == "" {
		return OpResult{ID: op.ID, Error: "tableId is required"}, outcomeRejected, nil
	}
	table, err := getTableRow(tx, tableID)
	if err != nil {
		return OpResult{}, outcomeRejected, err
	}
	if table == nil {
		return OpResult{ID: op.ID, Error: "unknown table"}, outcomeRejected, nil
	}
	isTableOwner := table.OwnerID == callerID

	// Membership is the floor for authoring: the Mesa's content is not
	// open to any authenticated stranger who knows its id.
	isMember, err := isTableMember(tx, tableID, callerID)
	if err != nil {
		return OpResult{}, outcomeRejected, err
	}
	if !isMember && !isTableOwner {
		return OpResult{ID: op.ID, Error: "only members of the table can manage its homebrew options"}, outcomeRejected, nil
	}

	if current == nil {
		if op.BaseVersion != 0 {
			return OpResult{ID: op.ID, Version: 0, Canonical: nil}, outcomeConflict, nil
		}
		name := stringFromPatch(op.Patch, "name", "")
		if name == "" {
			return OpResult{ID: op.ID, Error: "option name is required"}, outcomeRejected, nil
		}
		kind := stringFromPatch(op.Patch, "kind", "")
		if kind != "subrace" && kind != "subclass" {
			return OpResult{ID: op.ID, Error: `kind must be "subrace" or "subclass"`}, outcomeRejected, nil
		}
		parentIndex := stringFromPatch(op.Patch, "parentIndex", "")
		if parentIndex == "" {
			// Unlike a monster (where an empty parent means "from
			// scratch"), an option with no parent could never be offered
			// to anyone: eligibility is looked up BY parent.
			return OpResult{ID: op.ID, Error: "parentIndex is required"}, outcomeRejected, nil
		}
		payload := stringFromPatch(op.Patch, "payload", "{}")
		if _, err := tx.Exec(
			`INSERT INTO rule_options (id, table_id, kind, name, parent_index, payload, owner_account_id, created_at, updated_at, version, deleted)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
			op.ID, tableID, kind, name, parentIndex, payload, callerID, now, now,
		); err != nil {
			return OpResult{}, outcomeRejected, err
		}
		if err := recordChange(tx, EntityRuleOption, op.ID, tableID, 1, now, false); err != nil {
			return OpResult{}, outcomeRejected, err
		}
		return OpResult{ID: op.ID, Version: 1}, outcomeAccepted, nil
	}

	if op.BaseVersion != current.Version {
		return OpResult{ID: op.ID, Version: current.Version, Canonical: current}, outcomeConflict, nil
	}

	// Author or GM — checked after the version guard, same ordering as
	// applyCharacterOp: a stale view can't be meaningfully authorized.
	if current.OwnerAccountID != callerID && !isTableOwner {
		return OpResult{ID: op.ID, Error: "only the author or the table's owner can edit this option"}, outcomeRejected, nil
	}

	newVersion := current.Version + 1
	if op.Deleted {
		if _, err := tx.Exec(`UPDATE rule_options SET deleted = 1, version = ?, updated_at = ? WHERE id = ?`, newVersion, now, op.ID); err != nil {
			return OpResult{}, outcomeRejected, err
		}
		if err := recordChange(tx, EntityRuleOption, op.ID, tableID, newVersion, now, true); err != nil {
			return OpResult{}, outcomeRejected, err
		}
		return OpResult{ID: op.ID, Version: newVersion}, outcomeAccepted, nil
	}

	name := stringFromPatch(op.Patch, "name", current.Name)
	payload := stringFromPatch(op.Patch, "payload", current.Payload)
	// kind and parent_index are fixed at creation: every ability bonus,
	// trait and feature in the payload was written against THIS parent
	// and THIS kind, so changing either silently reinterprets all of it —
	// the same reasoning as a derived monster's parent_index.
	if _, err := tx.Exec(
		`UPDATE rule_options SET name = ?, payload = ?, version = ?, updated_at = ? WHERE id = ?`,
		name, payload, newVersion, now, op.ID,
	); err != nil {
		return OpResult{}, outcomeRejected, err
	}
	if err := recordChange(tx, EntityRuleOption, op.ID, tableID, newVersion, now, false); err != nil {
		return OpResult{}, outcomeRejected, err
	}
	return OpResult{ID: op.ID, Version: newVersion}, outcomeAccepted, nil
}

// isTableMember reports whether accountId has a table_members row for
// tableID (any role).
func isTableMember(tx *sql.Tx, tableID string, accountID int64) (bool, error) {
	var one int
	err := tx.QueryRow(
		`SELECT 1 FROM table_members WHERE table_id = ? AND account_id = ?`,
		tableID, accountID,
	).Scan(&one)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// resolveOwnerAccountID reads patch["ownerAccountId"], distinguishing
// "absent" (keep current) from "explicit null" (clear it) from "a number"
// (assign it). current may be nil on create, in which case "absent" means
// "no owner".
func resolveOwnerAccountID(patch map[string]interface{}, current *CharacterRow) (*int64, bool) {
	v, ok := patch["ownerAccountId"]
	if !ok {
		if current != nil {
			return current.OwnerAccountID, false
		}
		return nil, false
	}
	if v == nil {
		return nil, true
	}
	switch n := v.(type) {
	case float64:
		id := int64(n)
		return &id, true
	case int64:
		return &n, true
	case int:
		id := int64(n)
		return &id, true
	case json.Number:
		id, err := n.Int64()
		if err != nil {
			return nil, true
		}
		return &id, true
	default:
		return nil, true
	}
}

func nullableString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func nullableInt64(v *int64) interface{} {
	if v == nil {
		return nil
	}
	return *v
}

// ApplyOp runs one op end to end in its own transaction. Each op in a
// POST /sync batch is applied independently (the outbox drains
// them all in one request, but there is no cross-op atomicity requirement —
// each entity's version guard is what matters, same as the mapState
// per-field guard).
func (s *Store) ApplyOp(callerID int64, op Op) (OpResult, string, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return OpResult{}, string(outcomeRejected), err
	}
	var result OpResult
	var outcome opOutcome
	switch op.EntityType {
	case EntityTable:
		result, outcome, err = s.applyTableOp(tx, callerID, op)
	case EntityCharacter:
		result, outcome, err = s.applyCharacterOp(tx, callerID, op)
	case EntityMonster:
		result, outcome, err = s.applyMonsterOp(tx, callerID, op)
	case EntityRuleOption:
		result, outcome, err = s.applyRuleOptionOp(tx, callerID, op)
	default:
		tx.Rollback()
		return OpResult{ID: op.ID, Error: fmt.Sprintf("unknown entityType %q", op.EntityType)}, string(outcomeRejected), nil
	}
	if err != nil {
		tx.Rollback()
		return OpResult{}, string(outcomeRejected), err
	}
	if outcome == outcomeRejected && result.Error != "" {
		// A rejection detected before any write — nothing to commit, but
		// rolling back an otherwise-empty transaction is still correct.
		tx.Rollback()
		return result, string(outcome), nil
	}
	if err := tx.Commit(); err != nil {
		return OpResult{}, string(outcomeRejected), err
	}
	return result, string(outcome), nil
}

// ApplySync runs every op in a POST /sync batch and buckets the results.
func (s *Store) ApplySync(callerID int64, ops []Op) (SyncResult, error) {
	var result SyncResult
	for _, op := range ops {
		res, outcome, err := s.ApplyOp(callerID, op)
		if err != nil {
			return result, err
		}
		switch opOutcome(outcome) {
		case outcomeAccepted:
			result.Accepted = append(result.Accepted, res)
		case outcomeConflict:
			result.Conflicts = append(result.Conflicts, res)
		default:
			result.Rejected = append(result.Rejected, res)
		}
	}
	return result, nil
}

// Join upserts the caller as a member of tableID — 'gm' if they already own
// it, 'player' otherwise. Idempotent.
func (s *Store) Join(tableID string, callerID int64) (string, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	table, err := getTableRow(tx, tableID)
	if err != nil {
		return "", err
	}
	if table == nil || table.Deleted {
		return "", sql.ErrNoRows
	}
	role := "player"
	if table.OwnerID == callerID {
		role = "gm"
	}
	if _, err := tx.Exec(
		`INSERT INTO table_members (table_id, account_id, role) VALUES (?, ?, ?)
		 ON CONFLICT (table_id, account_id) DO UPDATE SET role = excluded.role`,
		tableID, callerID, role,
	); err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return role, nil
}
