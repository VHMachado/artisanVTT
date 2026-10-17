import { useEffect } from "react";

import { toggleFullscreen } from "../helpers/fullscreen";

/**
 * Pressing F11 anywhere in the app toggles OS/window fullscreen (see
 * `helpers/fullscreen.ts`). Deliberately a plain `window` keydown listener,
 * not `contexts/KeyboardContext`'s `useKeyboard` — that hook ignores
 * keystrokes while a text input/textarea is focused, but F11 isn't text
 * input and should still toggle fullscreen regardless of focus.
 */
export default function useFullscreenShortcut(): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "F11") {
        event.preventDefault();
        toggleFullscreen();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
