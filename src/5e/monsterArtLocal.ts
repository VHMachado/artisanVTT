/**
 * The local, out-of-repo override folder for global monster
 * art — moved `public/monster-token-art/` and `public/monster-art/`
 * (unlicensed-for-redistribution third-party content) out of the
 * published repo without the user losing their own table's art. The
 * mechanism is also the path a future redistributable dataset
 * can ship through unchanged, since the local folder vs.
 * bundled-manifest priority logic (monsterTokenArt.ts/monsterArt.ts)
 * never assumed the bundled side had any files — "absent means no
 * image" was always the contract on both sides.
 *
 * A Wails-bound Go method (`ScanLocalMonsterArt`, desktop/main.go) walks
 * the configured local root (default `%APPDATA%\Artisan\monster-art-local
 * \{token-art,portraits}\`, overridable via `SetLocalMonsterArtRoot`) once
 * at app startup and returns its contents as JSON; this module just holds
 * that result in memory and exposes lookups by SRD `index`. There is no
 * live file-watching — a changed local folder only takes effect on the
 * next app launch, same as every other bundled manifest.
 *
 * CONTRACT (enforced by the CALLERS of this module —
 * monsterTokenArt.ts/monsterArt.ts — not here): the local folder takes
 * priority over the art bundled in the repo, but always loses to a
 * specific Mesa's own `tokenAssetIds`/`portraitAssetId` overrides (the
 * per-Mesa GM upload already at the top of the existing resolution
 * order, see helpers/tableMonsters.ts).
 *
 * No binding exists in the web build/preview (there is no `window.go`
 * there, and no local filesystem to read anyway) — every function here
 * degrades to "no local art" rather than throwing, exactly like every
 * other optional desktop-only integration in this codebase (see
 * helpers/spectator.ts for the same `window.go.main.App` pattern this
 * mirrors).
 */

type LocalTokenArtVariant = { file: string; width: number; height: number };

export type LocalMonsterArtData = {
  tokenArt: Record<string, LocalTokenArtVariant[]>;
  portraits: Record<string, string>;
};

const EMPTY_OVERRIDE: LocalMonsterArtData = { tokenArt: {}, portraits: {} };

let localOverride: LocalMonsterArtData = EMPTY_OVERRIDE;

/**
 * Loads the local override folder's contents into memory — call once at
 * app bootstrap (src/index.tsx), before the first render that might read
 * `hasMonsterTokenArt`/`monsterArtUrl` etc. Never rejects: a missing
 * binding, a malformed JSON response, or a rejected call all leave
 * `localOverride` at its empty default rather than blocking startup or
 * propagating an error the caller would have to handle.
 */
export async function loadLocalMonsterArtOverrides(): Promise<void> {
  const scanFn = (window as any)?.go?.main?.App?.ScanLocalMonsterArt;
  if (typeof scanFn !== "function") {
    localOverride = EMPTY_OVERRIDE;
    return;
  }
  try {
    const json = await scanFn();
    localOverride = JSON.parse(json) as LocalMonsterArtData;
  } catch {
    localOverride = EMPTY_OVERRIDE;
  }
}

/** The local token-art variants for an SRD monster's `index`, or
 * undefined when the user's local folder has none for it. */
export function localTokenArtVariants(
  index: string
): LocalTokenArtVariant[] | undefined {
  return localOverride.tokenArt[index];
}

/** The local portrait filename for an SRD monster's `index` (relative to
 * `.../monster-art-local/portraits/`), or undefined when the user's
 * local folder has none for it. */
export function localPortraitFile(index: string): string | undefined {
  return localOverride.portraits[index];
}

/**
 * The remaining desktop-only bindings (UI) a Settings
 * screen needs to let the user see/choose/populate the local override
 * folder, mirroring the degrade-to-undefined/no-op contract the rest of
 * this module already follows for the web build.
 */

/** The absolute path of the current local monster-art root, or undefined
 * in the web build (no `window.go` binding there at all). */
export async function getLocalMonsterArtRoot(): Promise<string | undefined> {
  const getFn = (window as any)?.go?.main?.App?.GetLocalMonsterArtRoot;
  if (typeof getFn !== "function") {
    return undefined;
  }
  try {
    const path = await getFn();
    return path || undefined;
  } catch {
    return undefined;
  }
}

/** Opens a native directory picker defaulting to the current root and,
 * if the user confirms a selection, persists it as the new root. Resolves
 * to undefined both when the user cancels the dialog and in the web
 * build — callers must not treat either as an error. Throws only when the
 * desktop binding itself reports a real failure (e.g. an unwritable
 * destination), so the caller can surface that to the user. */
export async function pickLocalMonsterArtRoot(): Promise<string | undefined> {
  const pickFn = (window as any)?.go?.main?.App?.PickLocalMonsterArtRoot;
  if (typeof pickFn !== "function") {
    return undefined;
  }
  const selected = await pickFn();
  return selected || undefined;
}

/** Opens a native directory picker for choosing a pack's source directory
 * (see `importLocalMonsterArtPack`) with the given dialog title. Resolves
 * to undefined on cancel or in the web build. */
export async function pickImportSourceDirectory(
  title: string
): Promise<string | undefined> {
  const pickFn = (window as any)?.go?.main?.App?.PickImportSourceDirectory;
  if (typeof pickFn !== "function") {
    return undefined;
  }
  const selected = await pickFn(title);
  return selected || undefined;
}

export type ImportLocalMonsterArtResult = {
  tokenArtMonsters: number;
  tokenArtFiles: number;
  tokenArtSkipped: number;
  portraits: number;
  portraitsSkipped: number;
};

/**
 * Copies a monster art pack (e.g. the user's own Forgotten
 * Adventures/WotC sets, currently vendored under `public/` but moved out
 * of the repo) into the current local override root. Either
 * argument may be undefined/empty to skip that half. Throws on a real
 * failure (missing source directory, unwritable destination) — the
 * caller is expected to show that to the user, since this is an explicit
 * user-initiated migration, not a silent background sync. Reloads the
 * in-memory override afterwards so the just-imported art is immediately
 * visible without requiring an app restart.
 */
export async function importLocalMonsterArtPack(
  tokenArtSourceDir: string | undefined,
  portraitsSourceDir: string | undefined
): Promise<ImportLocalMonsterArtResult> {
  const importFn = (window as any)?.go?.main?.App?.ImportLocalMonsterArtPack;
  if (typeof importFn !== "function") {
    throw new Error(
      "Importação de pacotes de arte só está disponível no app desktop."
    );
  }
  const json = await importFn(tokenArtSourceDir ?? "", portraitsSourceDir ?? "");
  const result = JSON.parse(json) as ImportLocalMonsterArtResult;
  await loadLocalMonsterArtOverrides();
  return result;
}
