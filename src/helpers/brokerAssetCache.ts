import { fetchAssetBlob } from "./assetUpload";
import { getTablesDatabase } from "./tablesDatabase";

import type { AccountSession } from "./account";

/** One cached broker image. Content-addressed by `id` (the asset hash the
 * broker serves it under), so an entry is never stale and never needs
 * invalidating. */
type CachedBrokerAsset = {
  id: string;
  mime: string;
  /** Blob avoids copying up to a 64 MiB broker asset through a JS
   * Uint8Array before IndexedDB can persist it. The Uint8Array union keeps
   * the first release's rows readable if a client upgrades in place. */
  file: Blob | Uint8Array;
  size?: number;
  accessedAt?: number;
};

const TABLE = "brokerAssets";
const MAX_BROKER_ASSET_CACHE_BYTES = 100 * 1024 * 1024;

/** A caller receives its own object URL (and revokes it itself), while this
 * map shares only the one network/cache fill that produced the Blob. */
const inFlight = new Map<string, Promise<Blob>>();

function blobFor(asset: CachedBrokerAsset): Blob {
  if (asset.file instanceof Blob) {
    return asset.file;
  }
  // `new Blob([asset.file])`, never `[asset.file.buffer]`: a Uint8Array
  // that came back through structured clone / msgpack can be a VIEW into
  // a larger ArrayBuffer, and handing over `.buffer` would splice in
  // unrelated bytes. This keeps old cache rows safe too.
  return new Blob([asset.file], { type: asset.mime });
}

async function readCached(hash: string): Promise<Blob | undefined> {
  try {
    const table = getTablesDatabase().table(TABLE);
    const cached = (await table.get(hash)) as CachedBrokerAsset | undefined;
    if (!cached) return undefined;
    try {
      void table.update(hash, { accessedAt: Date.now() }).catch(() => undefined);
    } catch {
      // Some degraded/test storage adapters only support get/put.
    }
    return blobFor(cached);
  } catch {
    // Storage disabled/unavailable — fall through to the network, same
    // posture as the rest of the app.
    return undefined;
  }
}

async function writeCached(asset: CachedBrokerAsset): Promise<void> {
  try {
    const table = getTablesDatabase().table(TABLE);
    await table.put(asset);
    const rows = (await table.toArray()) as CachedBrokerAsset[];
    let total = rows.reduce((sum, row) => sum + (row.size ?? blobFor(row).size), 0);
    const oldestFirst = [...rows].sort(
      (left, right) => (left.accessedAt ?? 0) - (right.accessedAt ?? 0)
    );
    for (const row of oldestFirst) {
      if (total <= MAX_BROKER_ASSET_CACHE_BYTES) break;
      await table.delete(row.id);
      total -= row.size ?? blobFor(row).size;
    }
  } catch {
    // Caching is opportunistic. A failed cache write must never stop the
    // currently requested image from rendering from its downloaded Blob.
  }
}

/**
 * Object URL for a broker asset, served from this device whenever
 * possible.
 *
 * The broker's `/asset/<hash>` endpoint needs a bearer token, so these
 * images can never be a plain `<img src>` — every consumer has to fetch
 * the bytes and wrap them in an object URL. They used to do that on EVERY
 * mount, straight over HTTP, so a Mesa card, a Personagem portrait or a
 * monster thumbnail silently fell back to a blank box whenever the broker
 * was unreachable, even for an image this device had already downloaded a
 * hundred times.
 *
 * Token/map art has always been cached on-device (ArtisanDB's `assets`
 * table, see contexts/AssetsContext.tsx); this gives the broker-hosted
 * images the same treatment. Caller still owns revoking the URL.
 */
export async function brokerAssetObjectURL(
  session: AccountSession,
  hash: string
): Promise<string> {
  const cached = await readCached(hash);
  if (cached) {
    return URL.createObjectURL(cached);
  }

  let loading = inFlight.get(hash);
  if (!loading) {
    loading = fetchAssetBlob(session, hash).then(async (blob) => {
      await writeCached({
        id: hash,
        mime: blob.type || "image/png",
        file: blob,
        size: blob.size,
        accessedAt: Date.now(),
      });
      return blob;
    });
    inFlight.set(hash, loading);
    void loading.finally(() => inFlight.delete(hash)).catch(() => undefined);
  }
  return URL.createObjectURL(await loading);
}
