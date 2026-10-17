import manifest from "./data/monster-art-manifest.json";
import { localPortraitFile } from "./monsterArtLocal";

/**
 * Global "Perfil" art for vendored SRD monsters — one official/curated
 * image per creature. The bundled manifest (`monster-art-manifest.json`)
 * is intentionally empty `{}` — the previous WotC-sourced
 * `public/monster-art/*.jpg` set wasn't licensed for redistribution, so
 * portrait art now lives ONLY in the user's local override folder
 * (monsterArtLocal.ts), served under `/monster-art-local/`. The manifest
 * stays as the "absent means no image" source of truth so a future
 * self-generated, redistributable dataset can populate it the
 * exact same way without any other code here changing.
 *
 * A static `public/` asset (not a Vite-bundled import) so `monsterArtUrl`
 * stays a plain string lookup — no per-image dynamic `import()`, and no
 * risk of bloating the JS bundle with hundreds of base64 images.
 *
 * A user's local override folder (monsterArtLocal.ts) takes
 * priority over this bundled manifest for any index it has a portrait
 * for, served under `/monster-art-local/` instead of `/monster-art/`.
 */
const monsterArtManifest: Record<string, string> = manifest;

/** The Perfil image URL for an SRD monster's `index`, or undefined when
 * this creature has no curated art (nothing renders — same "absent means
 * no image" contract portraitAssetId already uses). Never called for a
 * homebrew/derived TableMonster id — those aren't SRD indices and resolve
 * their own art through portraitAssetId/tokenAssetIds instead. */
export function monsterArtUrl(index: string): string | undefined {
  const local = localPortraitFile(index);
  if (local) {
    return `/monster-art-local/${local}`;
  }
  const filename = monsterArtManifest[index];
  return filename ? `/monster-art/${filename}` : undefined;
}

export function hasMonsterArt(index: string): boolean {
  return localPortraitFile(index) !== undefined || index in monsterArtManifest;
}
