import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Flex, Label } from "theme-ui";
import ReactResizeDetector from "react-resize-detector";
import { useToasts } from "react-toast-notifications";

import ConfirmModal from "./ConfirmModal";
import EditMapModal from "./EditMapModal";

import DatabaseDisabledMessage from "../components/DatabaseDisabledMessage";
import LoadingOverlay from "../components/LoadingOverlay";
import Modal from "../components/Modal";
import ImageDrop from "../components/image/ImageDrop";
import MapEditBar from "../components/map/MapEditBar";
import MapTiles from "../components/map/MapTiles";
import SelectMapSelectButton from "../components/map/SelectMapSelectButton";
import TileActionBar from "../components/tile/TileActionBar";
import TilesContainer from "../components/tile/TilesContainer";
import TilesOverlay from "../components/tile/TilesOverlay";

import { useAssets } from "../contexts/AssetsContext";
import { useDatabase } from "../contexts/DatabaseContext";
import { GroupProvider } from "../contexts/GroupContext";
import { TileDragProvider } from "../contexts/TileDragContext";
import { useMapData } from "../contexts/MapDataContext";
import { useUserId } from "../contexts/UserIdContext";
import { findGroup, getItemNames, removeGroupsItems, restoreHiddenGroups } from "../helpers/group";
import { createMapFromFile, filterMapsForTable } from "../helpers/map";
import useResponsiveLayout from "../hooks/useResponsiveLayout";
import type {
  MapChangeEventHandler,
  MapResetEventHandler,
  RequestCloseEventHandler,
} from "../types/Events";
import type { Map } from "../types/Map";

type SelectMapModalProps = {
  currentMap: Map | null;
  isOpen: boolean;
  onDone: RequestCloseEventHandler;
  onMapChange: MapChangeEventHandler;
  onMapReset: MapResetEventHandler;
  /** The Mesa being browsed — see types/Map.ts's `tableId` doc comment:
   * only maps stamped with this id, or predating that field entirely,
   * are listed/editable here, and every newly imported map gets stamped
   * with it. */
  tableId: string;
};

type ModalSize = { height: number; width: number };

const largeImportBytes = 20_000_000;
const rejectedImportBytes = 50_000_000;

/** Browses the map library, imports image maps, and chooses the active map. */
function SelectMapModal({
  currentMap,
  isOpen,
  onDone,
  onMapChange,
  onMapReset,
  tableId,
}: SelectMapModalProps) {
  const { addToast } = useToasts();
  const { addAssets } = useAssets();
  const { databaseStatus } = useDatabase();
  const userId = useUserId();
  const layout = useResponsiveLayout();
  const {
    addMap,
    getMap,
    getMapState,
    mapGroups,
    maps,
    mapsLoading,
    mapStates,
    updateMap,
    updateMapGroups,
    updateMapState,
  } = useMapData();

  // Bug fix (2026-10-26): maps were shared across every Mesa a GM has on
  // this device — a single global Dexie "maps" table with no table
  // concept at all (see types/Map.ts's `tableId` doc comment). Only
  // maps stamped with THIS Mesa's id (or predating the field) are
  // listed, grouped, or named here; `mapsById`/`updateMapGroups` stay
  // scoped the same way so the folder tree never references a hidden
  // map and bulk group edits can't silently touch another Mesa's maps.
  const scopedMaps = useMemo(
    () => filterMapsForTable(maps, tableId),
    [maps, tableId]
  );
  const hiddenMapIds = useMemo(() => {
    const visible = new Set(scopedMaps.map((map) => map.id));
    return maps.filter((map) => !visible.has(map.id)).map((map) => map.id);
  }, [maps, scopedMaps]);
  const scopedMapsById = useMemo(
    () => Object.fromEntries(scopedMaps.map((map) => [map.id, map])),
    [scopedMaps]
  );
  const scopedMapGroups = useMemo(
    () => removeGroupsItems(mapGroups, hiddenMapIds),
    [mapGroups, hiddenMapIds]
  );

  const chooserInput = useRef<HTMLInputElement>(null);
  const warnedFiles = useRef<File[]>();
  const [editingId, setEditingId] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [largeWarningOpen, setLargeWarningOpen] = useState(false);
  const [mapNames, setMapNames] = useState(() => getItemNames(scopedMaps));
  const [modalSize, setModalSize] = useState<ModalSize>({ height: 0, width: 0 });
  const [mayAddDraggedMap, setMayAddDraggedMap] = useState(false);

  useEffect(() => {
    setMapNames(getItemNames(scopedMaps));
  }, [scopedMaps]);

  function resetImageChooser() {
    if (chooserInput.current) {
      chooserInput.current.value = "";
    }
  }

  async function enablePersistentStorage() {
    if (navigator.storage) {
      await navigator.storage.persist();
    }
  }

  function acceptFilesUnderLimit(files: File[]) {
    const accepted: File[] = [];
    for (const file of files) {
      if (file.size > rejectedImportBytes) {
        addToast(`Unable to import map ${file.name} as it is over 50MB`);
      } else {
        accepted.push(file);
      }
    }
    return accepted;
  }

  async function importMapFile(file: File) {
    if (!userId) {
      return;
    }
    setIsBusy(true);
    const { assets, map } = await createMapFromFile(file, userId, tableId);
    await addMap(map);
    await addAssets(assets);
    setIsBusy(false);
  }

  async function importFilesInSequence(files: File[]) {
    for (const file of files) {
      await importMapFile(file);
    }
  }

  async function receiveMapFiles(files: File[]) {
    await enablePersistentStorage();
    const accepted = acceptFilesUnderLimit(files);
    if (accepted.some((file) => file.size > largeImportBytes)) {
      warnedFiles.current = accepted;
      setLargeWarningOpen(true);
      return;
    }
    await importFilesInSequence(accepted);
    resetImageChooser();
  }

  function cancelLargeImport() {
    warnedFiles.current = undefined;
    setLargeWarningOpen(false);
    resetImageChooser();
  }

  async function confirmLargeImport() {
    setLargeWarningOpen(false);
    await importFilesInSequence(warnedFiles.current || []);
    warnedFiles.current = undefined;
    resetImageChooser();
  }

  async function chooseMap(mapId: string) {
    if (isBusy) {
      return;
    }
    if (!mapId) {
      onMapChange(null, null);
      onDone();
      return;
    }

    setIsBusy(true);
    const [map, state] = await Promise.all([getMap(mapId), getMapState(mapId)]);
    onMapChange(map || null, state || null);
    setIsBusy(false);
    onDone();
  }

  function updateSelectedGroups(groupIds: string[]) {
    if (groupIds.length !== 1) {
      setMayAddDraggedMap(false);
      return;
    }
    setMayAddDraggedMap(findGroup(scopedMapGroups, groupIds[0])?.type === "item");
  }

  function selectDraggedMap(groupIds: string[]) {
    if (groupIds.length === 1) {
      chooseMap(groupIds[0]);
    }
  }

  function recordModalSize(width?: number, height?: number) {
    if (width && height) {
      setModalSize({ height, width });
    }
  }

  const editingMap = editingId ? scopedMaps.find((map) => map.id === editingId) : undefined;
  const editingState = editingId ? mapStates.find((state) => state.mapId === editingId) : undefined;
  const dragAddHandler = mayAddDraggedMap ? selectDraggedMap : undefined;
  const tileEvents = {
    onDragAdd: dragAddHandler,
    onDragCancel: () => setIsDraggingMap(false),
    onDragEnd: () => setIsDraggingMap(false),
    onDragStart: () => setIsDraggingMap(true),
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onDone}
      shouldCloseOnEsc={!isDraggingMap}
      style={{ content: { maxWidth: layout.modalSize, width: "calc(100% - 16px)" } }}
    >
      <>
        <ImageDrop dropText="Drop map to import" onDrop={({ files }) => receiveMapFiles(files)}>
        <input
          accept="image/jpeg, image/gif, image/png, image/webp"
          multiple
          onChange={(event) => {
            if (event.target.files) {
              receiveMapFiles(Array.from(event.target.files));
            }
          }}
          ref={chooserInput}
          style={{ display: "none" }}
          type="file"
        />
        <ReactResizeDetector
          handleHeight
          handleWidth
          onResize={recordModalSize}
          refreshMode="debounce"
        >
          <GroupProvider
            disabled={!isOpen}
            groups={scopedMapGroups}
            itemNames={mapNames}
            onGroupsChange={(nextGroups) =>
              updateMapGroups(restoreHiddenGroups(mapGroups, nextGroups, hiddenMapIds))
            }
            onGroupsSelect={updateSelectedGroups}
          >
            <Flex sx={{ flexDirection: "column" }}>
              <Label pb={1} pt={2}>Select or import a map</Label>
              <TileActionBar addTitle="Import Map(s)" onAdd={() => chooserInput.current?.click()} />
              <Box sx={{ position: "relative" }}>
                <TileDragProvider {...tileEvents}>
                  <TilesContainer>
                    {databaseStatus === "disabled" && <DatabaseDisabledMessage type="Map" />}
                    <MapTiles
                      mapsById={scopedMapsById}
                      onMapEdit={setEditingId}
                      onMapSelect={chooseMap}
                    />
                  </TilesContainer>
                </TileDragProvider>
                <TileDragProvider {...tileEvents}>
                  <TilesOverlay modalSize={modalSize}>
                    <MapTiles
                      mapsById={scopedMapsById}
                      onMapEdit={setEditingId}
                      onMapSelect={chooseMap}
                      subgroup
                    />
                  </TilesOverlay>
                </TileDragProvider>
                <MapEditBar
                  currentMap={currentMap}
                  disabled={isBusy || Boolean(editingId)}
                  onLoad={setIsBusy}
                  onMapChange={onMapChange}
                  onMapReset={onMapReset}
                />
              </Box>
              <SelectMapSelectButton disabled={isBusy} onMapSelect={chooseMap} />
            </Flex>
          </GroupProvider>
        </ReactResizeDetector>
        </ImageDrop>
        <>{(isBusy || mapsLoading) && <LoadingOverlay bg="overlay" />}</>
        <>
          {editingMap && editingState && (
            <EditMapModal
              isOpen={Boolean(editingId)}
              map={editingMap}
              mapState={editingState}
              onDone={() => setEditingId(undefined)}
              onUpdateMap={updateMap}
              onUpdateMapState={updateMapState}
            />
          )}
        </>
        <ConfirmModal
        confirmText="Continue"
        description="An imported image is larger than 20MB, this may cause slowness. Continue?"
        isOpen={largeWarningOpen}
        label="Warning"
        onConfirm={confirmLargeImport}
          onRequestClose={cancelLargeImport}
        />
      </>
    </Modal>
  );
}

export default SelectMapModal;