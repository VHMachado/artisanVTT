import { AccountSession } from "./account";
import { brokerUrl } from "./broker";

/** SHA-256 hex digest of a Blob's bytes, matching the broker's
 * content-addressed asset scheme. Relies on
 * `crypto.subtle`, confirmed available in the Wails WebView2 shell without
 * HTTPS (same secure-context treatment that already lets
 * `navigator.storage.persist()` work there).
 */
export async function hashAsset(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function requireBroker(): string {
  if (!brokerUrl) {
    throw new Error("No server configured, uploads are unavailable");
  }
  return brokerUrl;
}

/** Uploads a file as a content-addressed asset (HEAD first, dedupe on the
 * broker's side too) and returns its hash, to be stored as a
 * bannerAssetId/portraitAssetId/tokenAssetId. */
export async function uploadAsset(
  session: AccountSession,
  file: Blob
): Promise<string> {
  const hash = await hashAsset(file);
  const base = requireBroker();
  const headers = { Authorization: `Bearer ${session.token}` };

  const headResponse = await fetch(`${base}/asset/${hash}`, {
    method: "HEAD",
    headers,
  });
  if (headResponse.status === 200) {
    return hash;
  }

  const putResponse = await fetch(`${base}/asset/${hash}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!putResponse.ok) {
    throw new Error("Unable to upload image");
  }
  return hash;
}

/** Download URL for an asset, for use as an <img src>. Since the endpoint
 * requires auth, this fetches the bytes and returns an object URL rather
 * than a plain URL the browser could fetch unauthenticated. */
export async function assetObjectURL(
  session: AccountSession,
  hash: string
): Promise<string> {
  const blob = await fetchAssetBlob(session, hash);
  return URL.createObjectURL(blob);
}

/** Raw bytes of a content-addressed asset, authenticated.
 * Shared by assetObjectURL above and helpers/characterToken.ts, which
 * needs the Blob itself (not an object URL) to hash/measure/cache it
 * locally as a FileTokenState's `file` asset. */
export async function fetchAssetBlob(
  session: AccountSession,
  hash: string
): Promise<Blob> {
  const base = requireBroker();
  const response = await fetch(`${base}/asset/${hash}`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!response.ok) {
    throw new Error("Unable to load image");
  }
  return response.blob();
}
