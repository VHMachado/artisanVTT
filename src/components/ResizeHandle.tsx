import { Box } from "theme-ui";

type ResizeHandleProps = {
  onPointerDown: (event: React.PointerEvent) => void;
  /** Which edge of the parent panel this handle sits on — Party's right
   * edge, TokenBar's left edge (both panels are otherwise `position:
   * relative`, so this positions the handle absolutely within them). */
  edge: "left" | "right";
};

/**
 * Thin drag handle sitting on a resizable panel's inner edge (Party's
 * right edge — see hooks/useResizableWidth.ts). A hover-only highlight
 * keeps it invisible until the user is actually about to grab it,
 * matching this app's otherwise chrome-free panels.
 */
function ResizeHandle({ onPointerDown, edge }: ResizeHandleProps) {
  return (
    <Box
      onPointerDown={onPointerDown}
      title="Arraste para redimensionar"
      sx={{
        position: "absolute",
        top: 0,
        bottom: 0,
        [edge]: "-3px",
        width: "6px",
        cursor: "ew-resize",
        zIndex: 2,
        touchAction: "none",
        // A barra da Party agora flutua sobre o mapa e seu quadro
        // externo usa `pointerEvents: none` para não engolir cliques
        // destinados ao canvas; sem reabrir aqui, a alça herdaria isso e
        // deixaria de ser arrastável.
        pointerEvents: "all",
        "&:hover": { backgroundColor: "primary" },
      }}
    />
  );
}

export default ResizeHandle;
