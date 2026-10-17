import { useState } from "react";
import { IconButton, SxProp } from "theme-ui";

import SelectMapModal from "../../modals/SelectMapModal";
import SelectMapIcon from "../../icons/SelectMapIcon";

import { useMapData } from "../../contexts/MapDataContext";
import { useUserId } from "../../contexts/UserIdContext";
import {
  MapChangeEventHandler,
  MapResetEventHandler,
} from "../../types/Events";
import { Map } from "../../types/Map";
import { MapState } from "../../types/MapState";

type SelectMapButtonProps = {
  onMapChange: MapChangeEventHandler;
  onMapReset: MapResetEventHandler;
  currentMap: Map | null;
  currentMapState: MapState | null;
  disabled: boolean;
} & SxProp;

/** Toolbar button that opens the map select modal */
function SelectMapButton({
  onMapChange,
  onMapReset,
  currentMap,
  currentMapState,
  disabled,
  sx,
}: SelectMapButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { updateMapState } = useMapData();
  const userId = useUserId();

  function openModal() {
    // Flush any pending local edits to the map's state before browsing
    // away from it, but only if we actually own it
    if (currentMapState && currentMap && currentMap.owner === userId) {
      updateMapState(currentMapState.mapId, currentMapState);
    }
    setIsModalOpen(true);
  }

  return (
    <>
      <IconButton
        aria-label="Select Map"
        title="Select Map"
        onClick={openModal}
        disabled={disabled}
        sx={sx}
      >
        <SelectMapIcon />
      </IconButton>
      <SelectMapModal
        isOpen={isModalOpen}
        onDone={() => setIsModalOpen(false)}
        onMapChange={onMapChange}
        onMapReset={onMapReset}
        currentMap={currentMap}
      />
    </>
  );
}

export default SelectMapButton;
