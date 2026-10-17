export type Character = {
  id: string;
  tableId: string;
  name: string;
  portraitAssetId?: string;
  tokenAssetId?: string;
  ownerAccountId: number | null;
  /** Display name of ownerAccountId's account, as last synced from the
   * broker (tables.CharacterRow.OwnerDisplayName — joined server-side from
   * accounts.display_name, see broker-go/internal/tables/ops.go). This is
   * NOT authoritative identity, just a label: a character's roster entry wants
   * "nome do Jogador abaixo, em tom mais apagado" under a character's
   * portrait in the roster, including for an owner who isn't currently
   * connected (PlayerState.accountId only covers who's online right now).
   * Undefined for an unowned character or before the first sync. */
  ownerDisplayName?: string;
  /** A future version will give this real shape; today it only needs it to round trip. */
  sheet: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  deleted: boolean;
};
