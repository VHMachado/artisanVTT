import manifest from "./data/monster-token-manifest.json";
import { localTokenArtVariants } from "./monsterArtLocal";

/**
 * Global top-down TOKEN art for vendored SRD monsters — separate from
 * "Perfil" art (monsterArt.ts): a portrait is a stat-block/list thumbnail,
 * this is what gets dropped on the map grid. The bundled manifest
 * (`data/monster-token-manifest.json`) is intentionally empty `{}` —
 * Forgotten Adventures/WotC art isn't licensed for
 * redistribution, so it now lives ONLY in the user's local override
 * folder (monsterArtLocal.ts). The manifest stays as the "absent means no
 * image" source of truth so a future self-generated, redistributable
 * dataset can populate it the exact same way without any
 * other code here changing.
 *
 * Modeled after monsterArt.ts's "absent means no image" contract, but
 * richer: every monster may have MULTIPLE variants (a GM drops five
 * goblins, each can look different), and each variant carries its own
 * width/height (unlike the fixed 256x256 circle silhouette every built-in
 * `tokenSources` token uses) since the source art isn't cropped square.
 *
 * A "monster-art" variant is identified by a synthetic key of the shape
 * `monster-art:<index>:<variantIndex>` — this key is stored in exactly the
 * same TokenState fields (`DefaultTokenState.key`, `monsterTokenVariants`)
 * a built-in silhouette token already uses, so Token.tsx/TokenImage.tsx/
 * TokenPreview.tsx need no changes: AssetsContext's useAssetURL resolves a
 * "default"-type key through `monsterTokenArtUrl` before falling back to
 * the bundled `tokenSources` map (see that function's own comment). No
 * broker/session/IndexedDB involved — these are plain static `public/`
 * files, exactly like monster-art (Perfil) images.
 *
 * A user's local override folder (monsterArtLocal.ts) takes
 * priority over this bundled manifest, but the two are never MIXED for
 * the same monster — if the local folder has any variant for an index,
 * ALL of that index's variants come from the local folder (served under
 * `/monster-token-art-local/`), and the bundled manifest for that index
 * is ignored entirely. The synthetic key format/count contract above is
 * unaffected either way; only where variant 0, 1, 2... actually resolve
 * to changes.
 */
const MONSTER_TOKEN_ART_PREFIX = "monster-art:";

type TokenArtVariant = { file: string; width: number; height: number };
const monsterTokenArtManifest: Record<string, TokenArtVariant[]> = manifest;

export function isMonsterTokenArtKey(key: string): boolean {
  return key.startsWith(MONSTER_TOKEN_ART_PREFIX);
}

/** The variant list to use for `index` and whether it came from the
 * user's local override folder or the bundled manifest — the single
 * place that decides "local wins the whole index, never mixed with
 * bundled" for every other function in this file. */
function variantsForIndex(
  index: string
): { variants: TokenArtVariant[]; source: "local" | "bundled" } | undefined {
  const local = localTokenArtVariants(index);
  if (local && local.length > 0) {
    return { variants: local, source: "local" };
  }
  const bundled = monsterTokenArtManifest[index];
  return bundled ? { variants: bundled, source: "bundled" } : undefined;
}

export function hasMonsterTokenArt(index: string): boolean {
  return variantsForIndex(index) !== undefined;
}

/** The list of synthetic variant keys for an SRD monster's `index`, in a
 * stable order — empty when this creature has no curated token art.
 * `monsterToken.ts` stores this directly as `monsterTokenVariants`. */
export function monsterTokenArtVariants(index: string): string[] {
  const resolved = variantsForIndex(index);
  if (!resolved) {
    return [];
  }
  return resolved.variants.map((_, i) => `${MONSTER_TOKEN_ART_PREFIX}${index}:${i}`);
}

/** Parses a synthetic variant key back into its resolved source entry,
 * or undefined for a malformed key or one whose monster/variant no
 * longer exists in either source (e.g. the manifest/local folder changed
 * since the key was stored on an old TokenState). */
function resolveVariant(
  key: string
): { index: string; variant: TokenArtVariant; source: "local" | "bundled" } | undefined {
  const rest = key.slice(MONSTER_TOKEN_ART_PREFIX.length);
  const lastColon = rest.lastIndexOf(":");
  if (lastColon === -1) {
    return undefined;
  }
  const index = rest.slice(0, lastColon);
  const variantIndex = Number(rest.slice(lastColon + 1));
  const resolved = variantsForIndex(index);
  const variant = resolved?.variants[variantIndex];
  return variant ? { index, variant, source: resolved!.source } : undefined;
}

/** Public URL for a synthetic monster-art token key, or undefined when it
 * doesn't resolve to a real entry — same "absent means no image"
 * contract as monsterArtUrl. */
export function monsterTokenArtUrl(key: string): string | undefined {
  const resolved = resolveVariant(key);
  if (!resolved) {
    return undefined;
  }
  const base =
    resolved.source === "local" ? "/monster-token-art-local" : "/monster-token-art";
  return `${base}/${resolved.index}/${resolved.variant.file}`;
}

/** The variant's real pixel dimensions, so a placed token keeps the art's
 * own aspect ratio instead of being squashed into the fixed 256x256 box
 * every built-in silhouette token uses (see monsterToken.ts's
 * baseMonsterTokenState). Falls back to a 1:1 guess for a stale/malformed
 * key — callers never block a token drop on this. */
export function monsterTokenArtSize(key: string): {
  width: number;
  height: number;
} {
  const resolved = resolveVariant(key);
  return resolved
    ? { width: resolved.variant.width, height: resolved.variant.height }
    : { width: 256, height: 256 };
}
