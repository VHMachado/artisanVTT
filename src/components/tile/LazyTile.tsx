import React from "react";
import { Box, ThemeUIStyleObject } from "theme-ui";
import { useInView } from "react-intersection-observer";

const hiddenSx: ThemeUIStyleObject = {
  height: 0,
  paddingTop: "100%",
  position: "relative",
  width: "100%",
};

const placeholderSx: ThemeUIStyleObject = {
  borderRadius: "4px",
  inset: 0,
  position: "absolute",
};

type LazyTileProps = { children: React.ReactNode };

function LazyTile({ children }: LazyTileProps) {
  const [observe, isVisible] = useInView({ triggerOnce: false });

  if (!isVisible) {
    return (
      <Box ref={observe} sx={hiddenSx}>
        <Box bg="background" sx={placeholderSx} />
      </Box>
    );
  }

  return <Box ref={observe}>{children}</Box>;
}

export default LazyTile;
