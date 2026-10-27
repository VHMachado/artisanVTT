import React, { useEffect, useState } from "react";
import Modal from "react-modal";
import { useThemeUI } from "theme-ui";
import CSS from "csstype";

import { RequestCloseEventHandler } from "../../types/Events";
import { useInteractionEmitter } from "../../contexts/MapInteractionContext";

type MapMenuProps = {
  isOpen: boolean;
  onRequestClose: RequestCloseEventHandler;
  onModalContent?: (instance: HTMLDivElement) => void;
  top?: number | string;
  left?: number | string;
  bottom?: number | string;
  right?: number | string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** A node to exclude from the "click outside closes" check, e.g. the button that opened this menu */
  excludeNode?: Node | null;
};

/**
 * A positioned popup menu anchored to a point on the map (rather than
 * centered like a normal `Modal`). Closes itself on any interaction
 * outside its own content and the optional `excludeNode`, and on the map
 * being dragged.
 */
function MapMenu({
  isOpen,
  onRequestClose,
  onModalContent = () => {},
  top = "initial",
  left = "initial",
  bottom = "initial",
  right = "initial",
  children,
  style = {},
  excludeNode = null,
}: MapMenuProps) {
  // Tracked in state (not just a ref) so the closing effect below reliably
  // sees the latest node even if isOpen flips without onModalContent firing
  const [modalContentNode, setModalContentNode] = useState<Node | null>(null);

  const interactionEmitter = useInteractionEmitter();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function closeOnMapDrag() {
      onRequestClose();
    }
    interactionEmitter?.on("dragStart", closeOnMapDrag);
    return () => {
      interactionEmitter?.off("dragStart", closeOnMapDrag);
    };
  });

  useEffect(() => {
    if (!modalContentNode) {
      return;
    }

    function closeOnOutsideInteraction(event: Event) {
      if (!modalContentNode) {
        return;
      }
      const path = event.composedPath();
      const isInsideMenu = path.includes(modalContentNode);
      const isExcluded = !!excludeNode && path.includes(excludeNode);
      const isTextAreaEdit = event.target instanceof HTMLTextAreaElement;

      if (!isInsideMenu && !isExcluded && !isTextAreaEdit) {
        onRequestClose();
        document.body.removeEventListener("pointerup", closeOnOutsideInteraction);
        document.body.removeEventListener("wheel", closeOnOutsideInteraction);
      }
    }

    document.body.addEventListener("pointerup", closeOnOutsideInteraction);
    document.body.addEventListener("wheel", closeOnOutsideInteraction);
    return () => {
      document.body.removeEventListener("pointerup", closeOnOutsideInteraction);
      document.body.removeEventListener("wheel", closeOnOutsideInteraction);
    };
  }, [modalContentNode, excludeNode, onRequestClose]);

  /**
   * `react-modal` treats `contentRef` as a plain React ref callback: it
   * fires with the content div on mount AND with `null` on unmount (every
   * close). `onModalContent` consumers measure the node they are handed
   * (SelectionMenu clamps itself to the map, TokenQuickMenu focuses its
   * input), so letting that detach call through means dereferencing null
   * inside React's commit phase — which is not catchable by the caller and
   * tears the whole tree down to a blank screen. Only ever forward a real
   * node; the local `modalContentNode` still tracks the null so the
   * click-outside listener stops matching a detached element.
   */
  function handleModalContent(node: HTMLDivElement | null) {
    setModalContentNode(node);
    if (node) {
      onModalContent(node);
    }
  }

  const { theme } = useThemeUI();

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      style={{
        overlay: { top: "0", bottom: "initial" },
        content: {
          backgroundColor: theme.colors?.overlay as CSS.Property.Color,
          top,
          left,
          right,
          bottom,
          padding: 0,
          borderRadius: "4px",
          border: "none",
          ...style,
        },
      }}
      contentRef={handleModalContent}
    >
      {children}
    </Modal>
  );
}

export default MapMenu;
