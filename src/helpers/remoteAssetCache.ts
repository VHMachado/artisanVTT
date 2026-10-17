import { fetchAssetBlob } from "./assetUpload";
import blobToBuffer from "./blobToBuffer";

import { AccountSession } from "./account";
import { Asset } from "../types/Asset";
import { GetAssetEventHanlder, PutAssetEventsHandler } from "../contexts/AssetsContext";

/**
 * Downloads (if needed) and caches a broker asset into the local game's
 * `assets` Dexie table, the shared step behind both a Personagem's token
 * image (helpers/characterToken.ts) and a monster token variant
 * (helpers/monsterToken.ts): the asset lives content-addressed on the
 * broker, not in this game's local store, so the first time
 * ANY local player drops/switches to a given image it has to be fetched
 * once and cached, the same as if it had just been uploaded through
 * createTokenFromFile (helpers/token.ts). Once cached, this device
 * becomes an `owner` other peers can request the asset from over WebRTC,
 * exactly like any other file token.
 */
export async function ensureRemoteAssetCached(
  session: AccountSession,
  getAsset: GetAssetEventHanlder,
  putAsset: PutAssetEventsHandler,
  assetId: string,
  userId: string
): Promise<{ asset: Asset; image: HTMLImageElement }> {
  const existing = await getAsset(assetId);
  if (existing) {
    const dimensions = await loadImageDimensions(
      new Blob([existing.file], { type: existing.mime })
    );
    return { asset: existing, image: dimensions.image };
  }
  const blob = await fetchAssetBlob(session, assetId);
  const buffer = await blobToBuffer(blob);
  const dimensions = await loadImageDimensions(blob);
  const asset: Asset = {
    id: assetId,
    file: buffer,
    width: dimensions.width,
    height: dimensions.height,
    mime: blob.type || "image/png",
    owner: userId,
  };
  await putAsset(asset);
  return { asset, image: dimensions.image };
}

export function loadImageDimensions(
  blob: Blob
): Promise<{ width: number; height: number; image: HTMLImageElement }> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  return new Promise((resolve, reject) => {
    image.onload = () => {
      resolve({ width: image.width, height: image.height, image });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to load image"));
    };
    image.src = url;
  });
}
