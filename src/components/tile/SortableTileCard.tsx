import React from "react";
import { Box } from "theme-ui";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { animated, useSpring } from "react-spring";

import { GROUP_ID_PREFIX } from "../../contexts/TileDragContext";

type SortableTileProps = {
  id: string;
  disableGrouping: boolean;
  disableSorting: boolean;
  hidden: boolean;
  children: React.ReactNode;
  isDragging: boolean;
  cursor: string;
};

function SortableTile({
  id,
  disableGrouping,
  disableSorting,
  hidden,
  children,
  isDragging,
  cursor,
}: SortableTileProps) {
  const sortable = useSortable({ id });
  const groupTarget = useDroppable({
    id: `${GROUP_ID_PREFIX}${id}`,
    disabled: disableGrouping,
  });
  const { opacity } = useSpring({ opacity: hidden ? 0 : 1 });
  const sortingHere = sortable.over?.id === id && !disableSorting;
  const groupingHere =
    sortable.over?.id === `${GROUP_ID_PREFIX}${id}` && sortable.active?.id !== id;

  return (
    <animated.div style={{ opacity, position: "relative" }}>
      <Box
        ref={sortable.setDraggableNodeRef}
        style={{ cursor, opacity: isDragging ? 0.25 : undefined }}
        {...sortable.attributes}
        {...sortable.listeners}
      >
        {children}
      </Box>
      <Box
        sx={{
          position: "absolute",
          top: 0,
          width: "100%",
          height: 0,
          paddingTop: "100%",
          pointerEvents: "none",
        }}
      >
        <Box
          ref={sortable.setDroppableNodeRef}
          bg="primary"
          style={{
            position: "absolute",
            top: 0,
            left: "-5px",
            width: "2px",
            height: "100%",
            borderRadius: "2px",
            visibility: sortingHere ? "visible" : "hidden",
          }}
        />
        <Box
          ref={groupTarget.setNodeRef}
          sx={{
            position: "absolute",
            inset: 0,
            borderWidth: "4px",
            borderRadius: "4px",
            borderColor: "primary",
            borderStyle: groupingHere ? "solid" : "none",
          }}
        />
      </Box>
    </animated.div>
  );
}

SortableTile.defaultProps = {
  cursor: "pointer",
};

export default SortableTile;
