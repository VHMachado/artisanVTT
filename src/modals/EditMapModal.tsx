import { useState } from "react";
import { Button, Flex, Label, useThemeUI } from "theme-ui";
import SimpleBar from "simplebar-react";

import Modal from "../components/Modal";
import MapEditor from "../components/map/MapEditor";
import MapSettings from "../components/map/MapSettings";

import { type MapData } from "../contexts/MapDataContext";
import { getGridDefaultInset } from "../helpers/grid";
import { isEmpty } from "../helpers/shared";
import useResponsiveLayout from "../hooks/useResponsiveLayout";
import type { Map } from "../types/Map";
import type { MapState } from "../types/MapState";

type EditMapModalProps = {
  isOpen: boolean;
  map: Map;
  mapState: MapState;
  onDone: () => void;
  onUpdateMap: MapData["updateMap"];
  onUpdateMapState: MapData["updateMapState"];
};

type StagedMapSettings = {
  map: Partial<Map>;
  state: Partial<MapState>;
};

function normalizeMapSettings(map: Map, changes: Partial<Map>): Partial<Map> {
  if (!changes.grid) {
    return { ...changes };
  }

  const grid = {
    ...changes.grid,
    inset: {
      bottomRight: { ...changes.grid.inset.bottomRight },
      topLeft: { ...changes.grid.inset.topLeft },
    },
    size: {
      x: changes.grid.size.x || 1,
      y: changes.grid.size.y || 1,
    },
  };
  const insetIsInverted =
    grid.inset.topLeft.x > grid.inset.bottomRight.x ||
    grid.inset.topLeft.y > grid.inset.bottomRight.y;

  if (insetIsInverted) {
    grid.inset = getGridDefaultInset(
      { size: grid.size, type: map.grid.type },
      map.width,
      map.height
    );
  }
  return { ...changes, grid };
}

function hasChanges({ map, state }: StagedMapSettings) {
  return !isEmpty(map) || !isEmpty(state);
}

/** Edits a map through drafts, committing map and map-state changes only on Save. */
function EditMapModal({
  isOpen,
  map,
  mapState,
  onDone,
  onUpdateMap,
  onUpdateMapState,
}: EditMapModalProps) {
  const { theme } = useThemeUI();
  const layout = useResponsiveLayout();
  const [staged, setStaged] = useState<StagedMapSettings>({ map: {}, state: {} });

  function stageMapChange(change: Partial<Map>) {
    setStaged((current) => ({
      ...current,
      map: { ...current.map, ...change },
    }));
  }

  function stageMapStateChange(change: Partial<MapState>) {
    setStaged((current) => ({
      ...current,
      state: { ...current.state, ...change },
    }));
  }

  function discardDraft() {
    setStaged({ map: {}, state: {} });
  }

  function closeWithoutSaving() {
    discardDraft();
    onDone();
  }

  async function saveDraft() {
    if (hasChanges(staged)) {
      const mapUpdate = normalizeMapSettings(map, staged.map);
      await onUpdateMap(map.id, mapUpdate);
      await onUpdateMapState(map.id, staged.state);
    }
    discardDraft();
    onDone();
  }

  const previewMap = { ...map, ...staged.map } as Map;
  const previewState: MapState = { ...mapState, ...staged.state };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={closeWithoutSaving}
      style={{
        content: {
          display: "flex",
          maxWidth: layout.modalSize,
          overflow: "hidden",
          padding: 0,
          width: "calc(100% - 16px)",
        },
      }}
    >
      <Flex sx={{ flexDirection: "column", width: "100%" }}>
        <Label pb={1} pt={2} px={3}>
          Edit map
        </Label>
        <SimpleBar
          style={{
            backgroundColor: theme.colors?.muted as string,
            height: "100%",
            margin: "0 8px",
            minHeight: 0,
            padding: "16px",
          }}
        >
          <MapEditor map={previewMap} onSettingsChange={stageMapChange} />
          <MapSettings
            map={previewMap}
            mapState={previewState}
            onSettingsChange={stageMapChange}
            onStateSettingsChange={stageMapStateChange}
          />
        </SimpleBar>
        <Button m={3} onClick={saveDraft}>
          Save
        </Button>
      </Flex>
    </Modal>
  );
}

export default EditMapModal;