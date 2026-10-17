import MapTile from "./MapTile";
import MapTileGroup from "./MapTileGroup";

import SortableTiles from "../tile/SortableTiles";
import SortableTilesDragOverlay from "../tile/SortableTilesDragOverlay";

import { getGroupItems } from "../../helpers/group";

import { useGroup } from "../../contexts/GroupContext";

import { Map } from "../../types/Map";
import { Group } from "../../types/Group";

type MapTilesProps = {
  mapsById: Record<string, Map>;
  onMapEdit: (mapId: string) => void;
  onMapSelect: (groupId: string) => void;
  subgroup?: boolean;
};

/**
 * Renders every tile in the map select grid (both individual maps and
 * groups of maps), plus the drag overlay shown while reordering them.
 */
function MapTiles({
  mapsById,
  onMapEdit,
  onMapSelect,
  subgroup = false,
}: MapTilesProps) {
  const { selectedGroupIds, selectMode, onGroupOpen, onGroupSelect } =
    useGroup();

  function renderTile(group: Group) {
    const isSelected = selectedGroupIds.includes(group.id);
    const isSingleSelection =
      isSelected && selectMode === "single" && selectedGroupIds.length === 1;

    if (group.type === "item") {
      const map = mapsById[group.id];
      if (!map) {
        return undefined;
      }
      return (
        <MapTile
          key={map.id}
          map={map}
          isSelected={isSelected}
          onSelect={onGroupSelect}
          onEdit={onMapEdit}
          onDoubleClick={() => isSingleSelection && onMapSelect(group.id)}
          canEdit={isSingleSelection}
          badges={[`${map.grid.size.x}x${map.grid.size.y}`]}
        />
      );
    }

    const items = getGroupItems(group);
    return (
      <MapTileGroup
        key={group.id}
        group={group}
        maps={items.map((item) => mapsById[item.id])}
        isSelected={isSelected}
        onSelect={onGroupSelect}
        onDoubleClick={() => isSingleSelection && onGroupOpen(group.id)}
      />
    );
  }

  return (
    <>
      <SortableTiles renderTile={renderTile} subgroup={subgroup} />
      <SortableTilesDragOverlay renderTile={renderTile} subgroup={subgroup} />
    </>
  );
}

export default MapTiles;
