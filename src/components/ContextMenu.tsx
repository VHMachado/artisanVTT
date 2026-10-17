import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Flex } from "theme-ui";

export type ContextMenuPosition = { x: number; y: number };

type ContextMenuProps = {
  position: ContextMenuPosition;
  onRequestClose: () => void;
  children: React.ReactNode;
};

/**
 * Minimal right-click menu, portaled to document.body so it isn't
 * clipped by a scrollable ancestor (CharacterRoster's SimpleBar) the way
 * an absolutely-positioned menu inside the row would be. Positioned at
 * the triggering click's client coordinates and closed on any outside
 * pointerdown or Escape — same dismiss behaviour as TableCard's dropdown.
 */
function ContextMenu({ position, onRequestClose, children }: ContextMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onRequestClose();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onRequestClose();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onRequestClose]);

  return createPortal(
    <Flex
      ref={containerRef}
      bg="surface"
      p={2}
      sx={{
        position: "fixed",
        top: `${position.y}px`,
        left: `${position.x}px`,
        flexDirection: "column",
        alignItems: "stretch",
        borderRadius: "12px",
        border: "1px solid",
        borderColor: "rgba(255, 255, 255, 0.06)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
        zIndex: 200,
        minWidth: "180px",
        gap: "2px",
      }}
    >
      {children}
    </Flex>,
    document.body
  );
}

export default ContextMenu;
