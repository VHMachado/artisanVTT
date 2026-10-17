import { useEffect, useRef, useState } from "react";
import { Box, IconButton, type ThemeUIStyleObject } from "theme-ui";

import { useMapStage } from "../../contexts/MapStageContext";
import RemoveTokenIcon from "../../icons/RemoveTokenIcon";

type DragOverlayProps = {
  dragging: boolean;
  onRemove: () => void;
};

// How often to re-check the pointer against the remove icon while dragging
const HOVER_POLL_MS = 100;

type PointerCheckArgs = {
  mapStageRef: ReturnType<typeof useMapStage>;
  removeIconRef: React.RefObject<HTMLDivElement>;
  setIsRemoveHovered: (value: boolean) => void;
};

function checkPointerOverRemoveIcon({
  mapStageRef,
  removeIconRef,
  setIsRemoveHovered,
}: PointerCheckArgs) {
  const mapStage = mapStageRef.current;
  const removeIcon = removeIconRef.current;
  const mapElement = document.querySelector(".map");
  const pointer = mapStage?.getPointerPosition();
  if (!mapStage || !removeIcon || !mapElement || !pointer) {
    return;
  }

  const mapRect = mapElement.getBoundingClientRect();
  const pointerScreenPosition = {
    x: pointer.x + mapRect.left,
    y: pointer.y + mapRect.top,
  };
  const removeIconRect = removeIcon.getBoundingClientRect();

  const isOverRemoveIcon =
    pointerScreenPosition.x > removeIconRect.left &&
    pointerScreenPosition.y > removeIconRect.top &&
    pointerScreenPosition.x < removeIconRect.right &&
    pointerScreenPosition.y < removeIconRect.bottom;

  setIsRemoveHovered(isOverRemoveIcon);
}

function overlayTransform(isHovered: boolean): string {
  return isHovered ? "translateX(-50%) scale(2.0)" : "translateX(-50%) scale(1.5)";
}

function commitRemovalIfDropped(
  dragging: boolean,
  isRemoveHovered: boolean,
  onRemove: () => void
) {
  if (!dragging && isRemoveHovered) {
    onRemove();
  }
}

/**
 * Floating "drop here to remove" target shown while a token is being
 * dragged. Hover detection is done manually on an interval (rather than a
 * pointer-enter listener) so it also works for touch drags, which don't
 * fire hover events on a Konva stage.
 */
export default function DragOverlay({ dragging, onRemove }: DragOverlayProps) {
  const [isRemoveHovered, setIsRemoveHovered] = useState(false);
  const removeIconRef = useRef<HTMLDivElement>(null);
  const mapStageRef = useMapStage();

  useEffect(() => {
    if (!dragging) {
      return;
    }

    const interval = setInterval(
      () => checkPointerOverRemoveIcon({ mapStageRef, removeIconRef, setIsRemoveHovered }),
      HOVER_POLL_MS
    );
    return () => clearInterval(interval);
  }, [dragging, mapStageRef]);

  // Dragging just ended while hovering the remove icon: commit the removal
  useEffect(() => commitRemovalIfDropped(dragging, isRemoveHovered, onRemove));

  if (!dragging) return null;

  const overlaySx: ThemeUIStyleObject = {
    position: "absolute",
    bottom: "32px",
    left: "50%",
    borderRadius: "50%",
    transform: overlayTransform(isRemoveHovered),
    transition: "transform 250ms ease",
    color: isRemoveHovered ? "primary" : "text",
    pointerEvents: "none",
  };

  return (
    <Box ref={removeIconRef} bg="overlay" sx={overlaySx}>
      <IconButton>
        <RemoveTokenIcon />
      </IconButton>
    </Box>
  );
}
