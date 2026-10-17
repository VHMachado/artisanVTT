import { Box } from "theme-ui";

import LoadingBar from "../LoadingBar";
import { useMapLoading } from "../../contexts/MapLoadingContext";

const overlaySx = {
  position: "absolute",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  top: 0,
  left: 0,
  right: 0,
  flexDirection: "column",
  zIndex: 2,
} as const;

/** Full-width bar pinned to the top of the map while its assets load */
export default function MapLoadingOverlay() {
  const loadingState = useMapLoading();
  if (!loadingState.isLoading) return null;

  return (
    <Box sx={overlaySx} bg="overlay">
      <LoadingBar
        isLoading={loadingState.isLoading}
        loadingProgressRef={loadingState.loadingProgressRef}
      />
    </Box>
  );
}
