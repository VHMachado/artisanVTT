import type { ReactNode } from "react";
import { Box as Overlay } from "theme-ui";

import ActivitySpinner from "./Spinner";

type LoadingOverlayProps = {
  bg?: string;
  children?: ReactNode;
};

const fillParent = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
} as const;

function LoadingOverlay({ children, bg = "muted" }: LoadingOverlayProps) {
  return (
    <Overlay sx={fillParent} bg={bg}>
      <ActivitySpinner />
      {children}
    </Overlay>
  );
}

export default LoadingOverlay;
