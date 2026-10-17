export type SyncedTable = {
  id: string;
  name: string;
  bannerAssetId?: string;
  ownerId: number;
  createdAt: number;
  updatedAt: number;
  /** Last version confirmed by the broker. 0 means "created locally,
   * never synced yet" — matches the broker's ApplyOp create-path
   * baseVersion convention. */
  version: number;
  deleted: boolean;
};

export type TableMember = {
  tableId: string;
  accountId: number;
  role: "gm" | "player";
};
