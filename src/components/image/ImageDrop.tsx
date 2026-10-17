import type { ReactNode } from "react";
import { Box, Flex, Text } from "theme-ui";

import useImageDrop, { type ImageDropEvent } from "../../hooks/useImageDrop";

type ImageDropProps = {
  children?: ReactNode;
  dropText?: string;
  onDrop: (event: ImageDropEvent) => void;
};

type DropOverlayProps = {
  listeners: ReturnType<typeof useImageDrop>["overlayListeners"];
  message: string;
};

const fallbackMessage = "Drop image to import";

function DropOverlay({ listeners, message }: DropOverlayProps) {
  return (
    <Flex
      {...listeners}
      bg="overlay"
      sx={{
        alignItems: "center",
        cursor: "copy",
        inset: 0,
        justifyContent: "center",
        position: "absolute",
      }}
    >
      <Text sx={{ color: "primary", pointerEvents: "none" }}>{message}</Text>
    </Flex>
  );
}

/** Adds the shared browser drag/drop protocol and a visible import target. */
function ImageDrop({ children, dropText, onDrop }: ImageDropProps) {
  const dropTarget = useImageDrop(onDrop);
  const message = dropText ?? fallbackMessage;

  return (
    <Box {...dropTarget.containerListeners}>
      {children}
      {dropTarget.dragging && (
        <DropOverlay listeners={dropTarget.overlayListeners} message={message} />
      )}
    </Box>
  );
}

export default ImageDrop;