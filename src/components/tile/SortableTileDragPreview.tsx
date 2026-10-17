import React from "react";
import { createPortal } from "react-dom";
import { DragOverlay } from "@dnd-kit/core";
import { animated, config, useSpring } from "react-spring";
import { Badge } from "theme-ui";

import { useTileDragId } from "../../contexts/TileDragContext";
import { useGroup } from "../../contexts/GroupContext";
import { Group } from "../../types/Group";

type SortableTilesDragOverlayProps = {
  renderTile: (group: Group) => React.ReactNode;
  subgroup: boolean;
};

function SortableTilesDragOverlay({
  renderTile,
  subgroup,
}: SortableTilesDragOverlayProps) {
  const dragId = useTileDragId();
  const {
    groups,
    selectedGroupIds: allSelectedIds,
    filter,
    openGroupId,
    openGroupItems,
    filteredGroupItems,
  } = useGroup();

  const activeGroups = subgroup
    ? openGroupItems
    : filter
    ? filteredGroupItems
    : groups;

  const selectedGroupIds =
    (subgroup && openGroupId) || (!subgroup && !openGroupId)
      ? allSelectedIds
      : [];
  const dragBounce = useSpring({
    transform: dragId ? "scale(0.9)" : "scale(1)",
    config: config.wobbly,
  });

  function renderDragOverlays() {
    const draggedIndex = activeGroups.findIndex((group) => group.id === dragId);
    const selectedIndices = selectedGroupIds
      .map((groupId) => activeGroups.findIndex((group) => group.id === groupId))
      .filter((index) => index >= 0)
      .sort((left, right) => (left === draggedIndex ? -1 : right === draggedIndex ? 1 : 0))
      .slice(0, 5)
      .reverse();

    return selectedIndices.map((groupIndex, index) => {
      const group = activeGroups[groupIndex];
      const offset = 5 * (selectedIndices.length - index - 1);
      const showCount = index === selectedIndices.length - 1 && selectedGroupIds.length > 1;

      return (
        <DragOverlay dropAnimation={null} key={group.id}>
          <div style={{ transform: `translate(${offset}%, ${offset}%)` }}>
            <animated.div style={{ ...dragBounce, position: "relative" }}>
              {renderTile(group)}
              {showCount && (
                <Badge sx={{ position: "absolute", top: 0, right: 0, transform: "translate(25%, -25%)" }}>
                  {selectedGroupIds.length}
                </Badge>
              )}
            </animated.div>
          </div>
        </DragOverlay>
      );
    });
  }

  return createPortal(dragId && renderDragOverlays(), document.body);
}

export default SortableTilesDragOverlay;
