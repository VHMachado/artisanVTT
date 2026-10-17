import { useState, useEffect } from "react";
import { Flex, Close, IconButton } from "theme-ui";

import { groupsFromIds, itemsFromGroups } from "../../helpers/group";

import ConfirmModal from "../../modals/ConfirmModal";

import ResetMapIcon from "../../icons/ResetMapIcon";
import RemoveMapIcon from "../../icons/RemoveMapIcon";

import { useGroup } from "../../contexts/GroupContext";
import { useMapData } from "../../contexts/MapDataContext";
import { useKeyboard } from "../../contexts/KeyboardContext";

import shortcuts from "../../shortcuts";
import { Map } from "../../types/Map";
import {
  MapChangeEventHandler,
  MapResetEventHandler,
} from "../../types/Events";

type MapEditBarProps = {
  currentMap: Map | null;
  disabled: boolean;
  onMapChange: MapChangeEventHandler;
  onMapReset: MapResetEventHandler;
  onLoad: (loading: boolean) => void;
};

/**
 * Bottom bar shown while one or more maps are selected in the map select
 * grid, offering bulk reset and remove actions.
 */
function MapEditBar({
  currentMap,
  disabled,
  onMapChange,
  onMapReset,
  onLoad,
}: MapEditBarProps) {
  const { maps, mapStates, removeMaps, resetMap } = useMapData();
  const { activeGroups, selectedGroupIds, onClearSelection } = useGroup();

  // Reset is only meaningful if at least one selected map actually has
  // state to clear
  const [hasMapState, setHasMapState] = useState(false);
  useEffect(() => {
    const selectedGroups = groupsFromIds(selectedGroupIds, activeGroups);
    const selectedMapStates = itemsFromGroups(selectedGroups, mapStates, "mapId");

    const anyHasState = selectedMapStates.some(
      (state) =>
        Object.values(state.tokens).length > 0 ||
        Object.values(state.fogs).length > 0
    );
    setHasMapState(anyHasState);
  }, [selectedGroupIds, mapStates, activeGroups]);

  function getSelectedMaps() {
    const selectedGroups = groupsFromIds(selectedGroupIds, activeGroups);
    return itemsFromGroups(selectedGroups, maps);
  }

  const [isMapsRemoveModalOpen, setIsMapsRemoveModalOpen] = useState(false);
  async function handleMapsRemove() {
    onLoad(true);
    setIsMapsRemoveModalOpen(false);
    const selectedMapIds = getSelectedMaps().map((map) => map.id);
    onClearSelection();
    await removeMaps(selectedMapIds);
    if (currentMap && selectedMapIds.includes(currentMap.id)) {
      onMapChange(null, null);
    }
    onLoad(false);
  }

  const [isMapsResetModalOpen, setIsMapsResetModalOpen] = useState(false);
  async function handleMapsReset() {
    onLoad(true);
    setIsMapsResetModalOpen(false);
    const selectedMapIds = getSelectedMaps().map((map) => map.id);
    for (const id of selectedMapIds) {
      const newState = await resetMap(id);
      if (currentMap?.id === id) {
        onMapReset(newState);
      }
    }
    onLoad(false);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (disabled) {
      return;
    }
    if (shortcuts.delete(event) && getSelectedMaps().length > 0) {
      setIsMapsResetModalOpen(false);
      setIsMapsRemoveModalOpen(true);
    }
  }
  useKeyboard(handleKeyDown);

  if (selectedGroupIds.length === 0) {
    return null;
  }

  return (
    <Flex
      bg="overlay"
      sx={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        justifyContent: "space-between",
      }}
    >
      <Close title="Clear Selection" aria-label="Clear Selection" onClick={() => onClearSelection()} />
      <Flex>
        <IconButton
          aria-label="Reset Selected Map(s)"
          title="Reset Selected Map(s)"
          onClick={() => setIsMapsResetModalOpen(true)}
          disabled={!hasMapState}
        >
          <ResetMapIcon />
        </IconButton>
        <IconButton
          aria-label="Remove Selected Map(s)"
          title="Remove Selected Map(s)"
          onClick={() => setIsMapsRemoveModalOpen(true)}
        >
          <RemoveMapIcon />
        </IconButton>
      </Flex>
      <ConfirmModal
        isOpen={isMapsResetModalOpen}
        onRequestClose={() => setIsMapsResetModalOpen(false)}
        onConfirm={handleMapsReset}
        confirmText="Reset"
        label="Reset Selected Map(s)"
        description="This will remove all fog and tokens from the selected maps."
      />
      <ConfirmModal
        isOpen={isMapsRemoveModalOpen}
        onRequestClose={() => setIsMapsRemoveModalOpen(false)}
        onConfirm={handleMapsRemove}
        confirmText="Remove"
        label="Remove Selected Map(s)"
        description="This operation cannot be undone."
      />
    </Flex>
  );
}

export default MapEditBar;
