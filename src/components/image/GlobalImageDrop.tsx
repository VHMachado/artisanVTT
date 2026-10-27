import { useRef, useState, type ReactNode } from "react";
import { Box, Flex, Text } from "theme-ui";
import { useToasts } from "react-toast-notifications";

import LoadingOverlay from "../LoadingOverlay";
import ConfirmModal from "../../modals/ConfirmModal";

import { createMapFromFile } from "../../helpers/map";

import { useAssets } from "../../contexts/AssetsContext";
import { useMapData } from "../../contexts/MapDataContext";
import { useUserId } from "../../contexts/UserIdContext";

import useImageDrop, { type ImageDropEvent } from "../../hooks/useImageDrop";

import type { Map } from "../../types/Map";
import type { MapState } from "../../types/MapState";
import type { TokenState } from "../../types/TokenState";

type GlobalImageDropProps = {
  children?: ReactNode;
  onMapChange: (map: Map, mapState: MapState) => void;
  // Kept for NetworkedMapAndTokens' established call-site contract.
  onMapTokensStateCreate: (states: TokenState[]) => void;
  /** The Mesa to stamp onto any map created from this drop, so it only
   * shows up in THIS Mesa's picker (types/Map.ts's `tableId`). */
  tableId: string;
};

const warningBytes = 20_000_000;
const maximumBytes = 50_000_000;

function GlobalDropOverlay({ listeners }: { listeners: ReturnType<typeof useImageDrop>["overlayListeners"] }) {
  return (
    <Flex
      {...listeners}
      sx={{
        bottom: 0,
        cursor: "copy",
        flexDirection: "column",
        left: 0,
        position: "absolute",
        right: 0,
        top: 0,
        zIndex: 100,
      }}
    >
      <Flex
        sx={{
          alignItems: "center",
          color: "primary",
          flexGrow: 1,
          justifyContent: "center",
          position: "relative",
          width: "100%",
        }}
      >
        <Box
          bg="overlay"
          sx={{
            border: "1px dashed",
            borderRadius: "12px",
            bottom: 0,
            left: 0,
            margin: "4px 16px",
            pointerEvents: "none",
            position: "absolute",
            right: 0,
            top: 0,
          }}
        />
        <Text sx={{ pointerEvents: "none", userSelect: "none" }}>Drop as map</Text>
      </Flex>
    </Flex>
  );
}

/**
 * Imports maps from a game-wide image drop. A single imported map becomes the
 * current map; multi-file drops only extend the library. Token-drop support is
 * deliberately absent, though its prop remains for the existing parent API.
 */
function GlobalImageDrop({ children, onMapChange, tableId }: GlobalImageDropProps) {
  const { addToast } = useToasts();
  const { addAssets } = useAssets();
  const { addMap, getMapState } = useMapData();
  const userId = useUserId();
  const pendingFiles = useRef<File[]>();
  const [isLoading, setIsLoading] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);

  async function requestPersistentStorage() {
    if (navigator.storage) {
      await navigator.storage.persist();
    }
  }

  function retainImportableFiles(files: File[]) {
    const retained: File[] = [];
    for (const file of files) {
      if (file.size > maximumBytes) {
        addToast(`Unable to import image ${file.name} as it is over 50MB`);
      } else {
        retained.push(file);
      }
    }
    return retained;
  }

  async function importPendingMaps() {
    const files = pendingFiles.current;
    if (!files || !userId) {
      return;
    }

    setIsLoading(true);
    const imported: Map[] = [];
    for (const file of files) {
      const { assets, map } = await createMapFromFile(file, userId, tableId);
      await addMap(map);
      await addAssets(assets);
      imported.push(map);
    }

    if (imported.length === 1) {
      const importedMap = imported[0];
      const importedState = await getMapState(importedMap.id);
      if (importedState) {
        onMapChange(importedMap, importedState);
      }
    }

    setIsLoading(false);
    pendingFiles.current = undefined;
  }

  async function handleDrop({ files }: ImageDropEvent) {
    await requestPersistentStorage();
    pendingFiles.current = retainImportableFiles(files);

    if (pendingFiles.current.some((file) => file.size > warningBytes)) {
      setWarningOpen(true);
      return;
    }
    await importPendingMaps();
  }

  function cancelLargeImport() {
    pendingFiles.current = undefined;
    setWarningOpen(false);
  }

  async function acceptLargeImport() {
    setWarningOpen(false);
    await importPendingMaps();
  }

  const dropTarget = useImageDrop(handleDrop);

  return (
    <Flex sx={{ flexGrow: 1, height: "100%" }} {...dropTarget.containerListeners}>
      {children}
      {dropTarget.dragging && <GlobalDropOverlay listeners={dropTarget.overlayListeners} />}
      <ConfirmModal
        confirmText="Continue"
        description="An imported image is larger than 20MB, this may cause slowness. Continue?"
        isOpen={warningOpen}
        label="Warning"
        onConfirm={acceptLargeImport}
        onRequestClose={cancelLargeImport}
      />
      {isLoading && <LoadingOverlay bg="overlay" />}
    </Flex>
  );
}

export default GlobalImageDrop;