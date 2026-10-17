package tables

// EntityType is the discriminator for a syncable entity — the two
// tables that go through the versioned op protocol.
type EntityType string

const (
	EntityTable     EntityType = "table"
	EntityCharacter EntityType = "character"
	// EntityMonster is a per-Mesa homebrew/derived creature. It
	// joins the same versioned op protocol because — unlike the vendored
	// SRD bestiary, which is static, ownerless and lives in the client —
	// this is user-authored content with an owner and an edit history.
	EntityMonster EntityType = "monster"
	// EntityRuleOption is a per-Mesa homebrew subrace or
	// subclass. It exists because the vendored SRD is a deliberately thin
	// sample: 4 subraces and exactly one subclass per class. Drow, Wood
	// Elf, College of Valor and the rest are Player's Handbook text, not
	// SRD, so they cannot ship with the app at all — the app ships the
	// MECHANISM and the table supplies the content it owns.
	EntityRuleOption EntityType = "rule_option"
)

// TableRow is the wire/JSON shape of a Mesa, used both as the `data` field
// of a sync change and as the "canonical" state on a rejected op.
type TableRow struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	BannerAssetID string `json:"bannerAssetId,omitempty"`
	OwnerID       int64  `json:"ownerId"`
	CreatedAt     int64  `json:"createdAt"`
	UpdatedAt     int64  `json:"updatedAt"`
	Version       int64  `json:"version"`
	Deleted       bool   `json:"deleted"`
}

// CharacterRow is the wire/JSON shape of a Personagem.
type CharacterRow struct {
	ID              string `json:"id"`
	TableID         string `json:"tableId"`
	Name            string `json:"name"`
	PortraitAssetID string `json:"portraitAssetId,omitempty"`
	TokenAssetID    string `json:"tokenAssetId,omitempty"`
	OwnerAccountID  *int64 `json:"ownerAccountId"`
	// OwnerDisplayName is NOT a stored column — it's joined from
	// accounts.display_name at read time (getCharacterRow/currentSnapshot)
	// so the character roster ("nome do Jogador abaixo, em tom mais
	// apagado") has something to show for a character's owner even when
	// that account isn't currently connected to the game socket (where
	// PlayerState.accountId would otherwise be the only source). Empty for
	// an unowned character.
	OwnerDisplayName string `json:"ownerDisplayName,omitempty"`
	Sheet            string `json:"sheet"`
	CreatedAt        int64  `json:"createdAt"`
	UpdatedAt        int64  `json:"updatedAt"`
	Version          int64  `json:"version"`
	Deleted          bool   `json:"deleted"`
}

// MonsterRow is the wire/JSON shape of a homebrew or derived
// creature — user content, per-Mesa, owned, in contrast with the vendored
// SRD bestiary that ships read-only inside the client.
type MonsterRow struct {
	ID      string `json:"id"`
	TableID string `json:"tableId"`
	Name    string `json:"name"`
	// ParentIndex is the SRD slug this creature derives from
	// ("duergar"), empty for one built from scratch.
	// "Derivados ficam atrelados ao monstro pai ... modelar como
	// parent_id + campos sobrescritos, para que a busca agrupe pai e
	// variações." Deliberately an SRD slug and never another homebrew's
	// id: a chain of derivations would need cycle detection and a
	// multi-level merge, and the vendored bestiary is the one parent
	// space both broker and client already agree on without syncing it.
	ParentIndex string `json:"parentIndex,omitempty"`
	// Overrides is the sparse JSON patch applied over the parent's stat
	// block (or the whole stat block, for a from-scratch creature). Kept
	// opaque here on purpose: the 5e schema lives in the client
	// (src/types/Monster.ts), and teaching the broker about hit dice or
	// legendary actions would duplicate it with no gain — the broker's
	// job for this entity is ownership, versioning and delivery.
	Overrides string `json:"overrides"`
	// PortraitAssetID is the "Perfil" image shown in the stat block,
	// optional: falls back to the built-in type silhouette
	// (helpers/monsterToken.ts) the same way a Character with no
	// portrait does (CharacterPortrait's PersonIcon fallback).
	PortraitAssetID string `json:"portraitAssetId,omitempty"`
	// TokenAssetIDs is a JSON array of asset hashes — the "variações de
	// aparência" the user asked for, so the SAME monster (e.g. "goblin
	// comum") can carry several looks a GM cycles through per token via
	// the map token's own right-click carousel (TokenState.variantIndex,
	// see monsterToken.ts). Kept opaque/serialised here for the same
	// reason Overrides is: the broker's job is ownership, versioning and
	// delivery, not modelling the art list.
	TokenAssetIDs string `json:"tokenAssetIds"`
	// OwnerAccountID is who authored it. Unlike a character this is never
	// null and never reassigned: it records authorship, and edit rights
	// come from the Mesa's GM rule below, not from it.
	OwnerAccountID int64 `json:"ownerAccountId"`
	CreatedAt      int64 `json:"createdAt"`
	UpdatedAt      int64 `json:"updatedAt"`
	Version        int64 `json:"version"`
	Deleted        bool  `json:"deleted"`
}

// RuleOptionRow is the wire/JSON shape of a homebrew subrace or
// subclass — the table's own content, filling the gap the SRD sample
// leaves (4 subraces, 1 subclass per class).
type RuleOptionRow struct {
	ID      string `json:"id"`
	TableID string `json:"tableId"`
	// Kind is "subrace" or "subclass". Validated here rather than left
	// free-form because it decides which SRD list ParentIndex must name,
	// and a typo would produce an option that can never be offered.
	Kind string `json:"kind"`
	Name string `json:"name"`
	// ParentIndex is the SRD race slug ("elf") for a subrace, or the
	// class slug ("bard") for a subclass. Required — an option with no
	// parent belongs to no character and would never be offered. Fixed
	// at creation for the same reason a monster's parent is: every
	// stored detail is written against THIS parent, and re-parenting
	// would silently reinterpret all of it.
	ParentIndex string `json:"parentIndex"`
	// Payload is the opaque JSON body: ability bonuses, traits, granted
	// features and the level each is gained at. Kept opaque for the same
	// reason MonsterRow.Overrides is — the 5e schema lives in the client
	// (src/types/HomebrewOption.ts), and duplicating it here would buy
	// nothing: the broker's job is ownership, versioning and delivery.
	Payload string `json:"payload"`
	// OwnerAccountID is the author. Unlike a monster (GM-only), this
	// entity is authored by GMs AND players, so the author is what
	// grants the edit right — see applyRuleOptionOp.
	OwnerAccountID int64 `json:"ownerAccountId"`
	// OwnerDisplayName is joined from accounts at read time, not stored,
	// so the UI can say whose homebrew an option is (same treatment as
	// CharacterRow's).
	OwnerDisplayName string `json:"ownerDisplayName,omitempty"`
	CreatedAt        int64  `json:"createdAt"`
	UpdatedAt        int64  `json:"updatedAt"`
	Version          int64  `json:"version"`
	Deleted          bool   `json:"deleted"`
}

// Change is one row of the changes log joined back against the live entity,
// exactly the shape GET /sync returns ("Protocolo de sync").
type Change struct {
	Seq        int64       `json:"seq"`
	EntityType EntityType  `json:"entityType"`
	EntityID   string      `json:"entityId"`
	TableID    string      `json:"tableId"`
	Version    int64       `json:"version"`
	UpdatedAt  int64       `json:"updatedAt"`
	Deleted    bool        `json:"deleted"`
	Data       interface{} `json:"data"`
}

// Op is one write request from POST /sync's body.
type Op struct {
	EntityType  EntityType             `json:"entityType"`
	ID          string                 `json:"id"`
	BaseVersion int64                  `json:"baseVersion"`
	Deleted     bool                   `json:"deleted,omitempty"`
	Patch       map[string]interface{} `json:"patch,omitempty"`
}

// OpResult is the fate of a single Op: accepted,
// conflict (stale baseVersion, canonical state returned), or rejected
// (authorization failure — the client must not retry as-is).
type OpResult struct {
	ID        string      `json:"id"`
	Version   int64       `json:"version,omitempty"`
	Canonical interface{} `json:"canonical,omitempty"`
	Error     string      `json:"error,omitempty"`
}

// SyncResult is POST /sync's response body.
type SyncResult struct {
	Accepted  []OpResult `json:"accepted"`
	Conflicts []OpResult `json:"conflicts"`
	Rejected  []OpResult `json:"rejected"`
}
