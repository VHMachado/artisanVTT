import { useCallback, useRef } from "react";

/**
 * Drag-to-resize handle logic shared by the Party sidebar (left) and the
 * TokenBar (right) — both need to be
 * user-resizable, and future panels (like a monster list) will reuse
 * this same handle on the right bar.
 *
 * `side` controls which way growing the pointer's movement should widen
 * the panel: "left" (Party) grows when the pointer moves right, "right"
 * (TokenBar) grows when the pointer moves left, since the handle sits on
 * the panel's inner edge in both cases.
 */
export function useResizableWidth(
  width: number,
  onWidthChange: (width: number) => void,
  side: "left" | "right",
  min = 96,
  max = 480
) {
  const startRef = useRef<{ pointerX: number; startWidth: number } | null>(
    null
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!startRef.current) {
        return;
      }
      const delta = event.clientX - startRef.current.pointerX;
      const signedDelta = side === "left" ? delta : -delta;
      const next = Math.min(
        max,
        Math.max(min, startRef.current.startWidth + signedDelta)
      );
      onWidthChange(next);
    },
    [max, min, onWidthChange, side]
  );

  const handlePointerUp = useCallback(() => {
    startRef.current = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  }, [handlePointerMove]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Not draggable's setPointerCapture — this handle isn't inside a
      // dnd-kit Draggable, so a plain window-level listener pair (added
      // on down, removed on up) is enough and keeps tracking the pointer
      // even if it leaves the thin handle element while dragging fast.
      event.preventDefault();
      startRef.current = { pointerX: event.clientX, startWidth: width };
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [handlePointerMove, handlePointerUp, width]
  );

  return handlePointerDown;
}

export default useResizableWidth;
