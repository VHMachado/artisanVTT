import React from "react";
import SimpleBar from "simplebar-react";
import { Grid, useThemeUI } from "theme-ui";

import Droppable from "../drag/Droppable";
import useResponsiveLayout from "../../hooks/useResponsiveLayout";
import { useGroup } from "../../contexts/GroupContext";
import { ADD_TO_MAP_ID } from "../../contexts/TileDragContext";

const gridSx = {
  borderRadius: "4px",
  overflow: "hidden",
  position: "relative",
} as const;

const dropZoneStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: -1,
};

function useScrollAreaStyle(height: number | string) {
  const { theme } = useThemeUI();
  return { height, backgroundColor: theme.colors?.muted as string };
}

type TilesContainerProps = { children: React.ReactNode };

function TilesContainer({ children }: TilesContainerProps) {
  const { onClearSelection } = useGroup();
  const { tileContainerHeight, tileGridColumns } = useResponsiveLayout();
  const scrollAreaStyle = useScrollAreaStyle(tileContainerHeight);

  return (
    <SimpleBar onClick={onClearSelection} style={scrollAreaStyle}>
      <Grid
        p={3}
        pb={4}
        gap={2}
        sx={gridSx}
        columns={`repeat(${tileGridColumns}, 1fr)`}
      >
        <Droppable id={ADD_TO_MAP_ID} style={dropZoneStyle} />
        {children}
      </Grid>
    </SimpleBar>
  );
}

export default TilesContainer;
