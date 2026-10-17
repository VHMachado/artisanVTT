import React from "react";
import { SortableContext } from "@dnd-kit/sortable";

import { moveGroupsInto } from "../../helpers/group";
import { keyBy } from "../../helpers/shared";

import SortableTile from "./SortableTile";
import LazyTile from "./LazyTile";

import {
  useTileDragId,
  useTileDragCursor,
  useTileOverGroupId,
  BASE_SORTABLE_ID,
  GROUP_SORTABLE_ID,
} from "../../contexts/TileDragContext";
import { useGroup } from "../../contexts/GroupContext";
import { Group } from "../../types/Group";

type SortableTilesProps = {
  renderTile: (group: Group) => React.ReactNode;
  subgroup: boolean;
};

function SortableTiles({ renderTile, subgroup }: SortableTilesProps) {
  const dragId = useTileDragId();
  const dragCursor = useTileDragCursor();
  const overGroupId = useTileOverGroupId();
  const {
    groups,
    selectedGroupIds: allSelectedIds,
    filter,
    openGroupId,
    openGroupItems,
    filteredGroupItems,
  } = useGroup();

  const activeGroups = subgroup
    ? openGroupItems
    : filter
    ? filteredGroupItems
    : groups;

  const sortableId = subgroup ? GROUP_SORTABLE_ID : BASE_SORTABLE_ID;

  const isInsideOpenGroup = subgroup && Boolean(openGroupId);
  const isBaseShelf = !subgroup && !openGroupId;
  const selectedGroupIds = isInsideOpenGroup || isBaseShelf ? allSelectedIds : [];
  const disableSorting = Boolean(filter || (openGroupId && !subgroup));
  const disableGrouping = subgroup || disableSorting;

  function renderSortableGroup(group: Group, selectedGroups: Group[]) {
    if (overGroupId === group.id && dragId && group.id !== dragId) {
      // If dragging over a group render a preview of that group
      const previewGroup = moveGroupsInto(
        [group, ...selectedGroups],
        0,
        selectedGroups.map((_, i) => i + 1)
      )[0];
      return renderTile(previewGroup);
    }
    return renderTile(group);
  }

  function renderTiles() {
    const groupsById = keyBy(activeGroups, "id");
    const selectedIds = new Set(selectedGroupIds);
    const selectedGroups = selectedGroupIds
      .map((id) => groupsById[id])
      .filter((group): group is Group => Boolean(group));
    const selectionContainsGroup = selectedGroups.some((group) => group.type === "group");

    return activeGroups.map((group) => {
      const selected = selectedIds.has(group.id);
      return (
        <LazyTile key={group.id}>
          <SortableTile
            id={group.id}
            disableGrouping={disableGrouping || selected || selectionContainsGroup}
            disableSorting={disableSorting}
            hidden={group.id === openGroupId}
            isDragging={Boolean(dragId && selected)}
            cursor={dragCursor || "pointer"}
          >
            {renderSortableGroup(group, selectedGroups)}
          </SortableTile>
        </LazyTile>
      );
    });
  }

  return (
    <SortableContext items={activeGroups} id={sortableId}>
      {renderTiles()}
    </SortableContext>
  );
}

export default SortableTiles;
