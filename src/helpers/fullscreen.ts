/**
 * OS/window fullscreen toggle, wired to the F11 shortcut (see
 * `hooks/useFullscreenShortcut.ts`).
 *
 * Two different APIs depending on where the app runs:
 * - Desktop (Wails): `window.runtime.Window(Un)Fullscreen`/`WindowIsFullscreen`,
 *   injected by the Wails runtime at startup (see
 *   `desktop/frontend/wailsjs/runtime/runtime.js`) — read off `window.runtime`
 *   directly rather than statically imported, same reason
 *   `helpers/spectator.ts` reads `window.go...` directly: `desktop/frontend`
 *   is gitignored and only exists after `wails build`.
 * - Web build/preview: the standard Fullscreen API on `document`.
 */

interface WailsRuntime {
  WindowFullscreen?: () => void;
  WindowUnfullscreen?: () => void;
  WindowIsFullscreen?: () => Promise<boolean>;
}

function getWailsRuntime(): WailsRuntime | undefined {
  return (window as unknown as { runtime?: WailsRuntime }).runtime;
}

export async function isFullscreen(): Promise<boolean> {
  const runtime = getWailsRuntime();
  if (runtime?.WindowIsFullscreen) {
    try {
      return await runtime.WindowIsFullscreen();
    } catch {
      return false;
    }
  }
  return document.fullscreenElement != null;
}

export async function toggleFullscreen(): Promise<void> {
  const runtime = getWailsRuntime();
  if (runtime?.WindowFullscreen && runtime?.WindowUnfullscreen) {
    const active = await isFullscreen();
    if (active) {
      runtime.WindowUnfullscreen();
    } else {
      runtime.WindowFullscreen();
    }
    return;
  }
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // Fullscreen API can reject (no user gesture, unsupported, etc) — F11 is
    // a best-effort convenience, nothing else depends on it succeeding.
  }
}
