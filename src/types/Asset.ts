/** A stored binary blob (map/token image, thumbnail, dice-face texture,
 * ...) plus the metadata needed to show it without decoding the bytes. */
export interface Asset {
  id: string;
  owner: string;
  mime: string;
  width: number;
  height: number;
  file: Uint8Array;
}

/** What the asset manifest exposes about an `Asset` to peers who haven't
 * fetched its bytes yet — just enough to request it or skip it. */
export type AssetManifestAsset = Pick<Asset, "id" | "owner">;

export type AssetManifestAssets = Record<string, AssetManifestAsset>;

/** Per-map index of which assets a peer should have, synced over the
 * socket so WebRTC asset transfer knows what to request. */
export interface AssetManifest {
  mapId: string;
  assets: AssetManifestAssets;
}
