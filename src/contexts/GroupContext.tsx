import React, { useContext, useEffect, useMemo, useState } from "react";
import cloneDeep from "lodash.clonedeep";
import Fuse from "fuse.js";

import { useKeyboard, useBlur } from "./KeyboardContext";

import { getGroupItems, groupsFromIds } from "../helpers/group";
import { useArtisanStore, selectShelfGroupIds } from "../state/artisanStore";

import shortcuts from "../shortcuts";
import { Group, GroupItem } from "../types/Group";

export type GroupSelectMode = "single" | "multiple" | "range";

type EventHandlers = {
  onSelectModeChange: (selectMode: GroupSelectMode) => void;
  onGroupOpen: (groupId: string) => void;
  onGroupClose: () => void;
  onGroupsChange: (newGroups: Group[]) => void;
  onSubgroupChange: (items: GroupItem[], groupId: string) => void;
  onGroupSelect: (groupId: string) => void;
  onClearSelection: () => void;
  onFilterChange: (filter: string) => void;
  onFilterClear: () => void;
};

type GroupContextValue = EventHandlers & {
  groups: Group[];
  activeGroups: Group[] | GroupItem[];
  openGroupId: string | undefined;
  openGroupItems: GroupItem[];
  filter: string | undefined;
  filteredGroupItems: GroupItem[];
  selectedGroupIds: string[];
  selectMode: GroupSelectMode;
};

const GroupContext =
  React.createContext<GroupContextValue | undefined>(undefined);

type GroupProviderProps = Pick<
  EventHandlers,
  "onGroupsChange"
> & {
  groups: Group[];
  itemNames: Record<string, string>;
  onGroupsSelect: (groupIds: string[]) => void;
  disabled: boolean;
  children: React.ReactNode;
};

/** The items of whichever group is currently "open" on the shelf (drilled
 * into), or `[]` when nothing is open. Closes the group itself, via
 * `closeShelfGroup`, if its id no longer resolves — it was deleted or
 * every item inside it was. */
function useOpenGroupItems(
  openGroupId: string | undefined,
  groups: Group[],
  closeShelfGroup: () => void
): GroupItem[] {
  const [items, setItems] = useState<GroupItem[]>([]);

  useEffect(() => {
    if (!openGroupId) {
      setItems([]);
      return;
    }
    const [resolved] = groupsFromIds([openGroupId], groups);
    if (resolved) {
      setItems(getGroupItems(resolved));
    } else {
      setItems([]);
      closeShelfGroup();
    }
  }, [openGroupId, groups, closeShelfGroup]);

  return items;
}

/** Fuse.js search over every item across every group, re-indexed whenever
 * the groups or their display names change, re-queried whenever the
 * filter text changes. Kept as one hook so the index and the query stay
 * next to each other instead of two separate effects in the component. */
function useFilteredGroupItems(
  groups: Group[],
  itemNames: Record<string, string>,
  filter: string | undefined
): GroupItem[] {
  const index = useMemo(() => {
    const items = groups.flatMap((group) =>
      getGroupItems(group).map((item) => ({ ...item, name: itemNames[item.id] }))
    );
    return new Fuse(items, { keys: ["name"] });
  }, [groups, itemNames]);

  return useMemo(() => {
    if (!filter) {
      return [];
    }
    return index.search(filter).map((result) => result.item);
  }, [filter, index]);
}

/** Wires the shelf's shift/cmd select-mode shortcuts (held-key range and
 * multi-select) to the keyboard bus and to window blur, so releasing the
 * key or tabbing away always drops back to `"single"`. */
function useSelectModeShortcuts(
  selectMode: GroupSelectMode,
  setSelectMode: (mode: GroupSelectMode) => void,
  disabled: boolean
) {
  useKeyboard(
    (event) => {
      if (disabled) {
        return;
      }
      if (shortcuts.selectRange(event)) {
        setSelectMode("range");
      }
      if (shortcuts.selectMultiple(event)) {
        setSelectMode("multiple");
      }
    },
    (event) => {
      if (disabled) {
        return;
      }
      if (shortcuts.selectRange(event) && selectMode === "range") {
        setSelectMode("single");
      }
      if (shortcuts.selectMultiple(event) && selectMode === "multiple") {
        setSelectMode("single");
      }
    }
  );

  useBlur(() => setSelectMode("single"));
}

/** Replaces the items of the subgroup `groupId` in-place within `groups`,
 * returning a fresh array — throws if the target isn't a subgroup, since
 * that means a caller passed the wrong id. */
function withSubgroupItems(
  groups: Group[],
  groupId: string,
  items: GroupItem[]
): Group[] {
  const index = groups.findIndex((group) => group.id === groupId);
  const target = groups[index];
  if (target.type !== "group") {
    throw new Error(`Group ${target} not a subgroup`);
  }
  const updated = cloneDeep(groups);
  updated[index] = { ...target, items };
  return updated;
}

/**
 * Temporary compatibility adapter over the shelf slice: it mounts the
 * shelf's shortcut/blur lifecycle and projects the Zustand store into the
 * same shape `useGroup()` always returned, so consumers migrate one at a
 * time without a behaviour gap. It owns no state of its own.
 */
export function GroupProvider(props: GroupProviderProps) {
  const { groups, itemNames, onGroupsChange, onGroupsSelect, disabled, children } =
    props;

  const selectedGroupIds = useArtisanStore((state) => state.selectedShelfGroupIds);
  const selectMode = useArtisanStore((state) => state.shelfSelectMode);
  const setSelectMode = useArtisanStore((state) => state.setShelfSelectMode);
  const openGroupId = useArtisanStore((state) => state.openShelfGroupId);
  const openShelfGroup = useArtisanStore((state) => state.openShelfGroup);
  const closeShelfGroup = useArtisanStore((state) => state.closeShelfGroup);
  const filter = useArtisanStore((state) => state.shelfFilter);
  const setShelfFilter = useArtisanStore((state) => state.setShelfFilter);
  const clearShelfFilter = useArtisanStore((state) => state.clearShelfFilter);
  const selectShelfGroup = useArtisanStore((state) => state.selectShelfGroup);
  const clearShelfSelection = useArtisanStore((state) => state.clearShelfSelection);

  const openGroupItems = useOpenGroupItems(openGroupId, groups, closeShelfGroup);
  const filteredGroupItems = useFilteredGroupItems(groups, itemNames, filter);
  useSelectModeShortcuts(selectMode, setSelectMode, disabled);

  const activeGroups = openGroupId
    ? openGroupItems
    : filter
    ? filteredGroupItems
    : groups;

  function handleGroupSelect(groupId: string) {
    const groupIds = selectShelfGroupIds(
      selectedGroupIds,
      selectMode,
      activeGroups,
      groupId
    );
    selectShelfGroup(groupId, activeGroups);
    onGroupsSelect(groupIds);
  }

  function handleClearSelection() {
    clearShelfSelection();
    onGroupsSelect([]);
  }

  const value = useMemo(
    () => ({
      groups,
      activeGroups,
      openGroupId,
      openGroupItems,
      filter,
      filteredGroupItems,
      selectedGroupIds,
      selectMode,
      onSelectModeChange: setSelectMode,
      onGroupOpen: openShelfGroup,
      onGroupClose: closeShelfGroup,
      onGroupsChange,
      onSubgroupChange: (items: GroupItem[], groupId: string) =>
        onGroupsChange(withSubgroupItems(groups, groupId, items)),
      onGroupSelect: handleGroupSelect,
      onClearSelection: handleClearSelection,
      onFilterChange: setShelfFilter,
      onFilterClear: clearShelfFilter,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      groups,
      activeGroups,
      openGroupId,
      openGroupItems,
      filter,
      filteredGroupItems,
      selectedGroupIds,
      selectMode,
    ]
  );

  return (
    <GroupContext.Provider value={value}>{children}</GroupContext.Provider>
  );
}

GroupProvider.defaultProps = {
  groups: [] as Group[],
  itemNames: {} as Record<string, string>,
  onGroupsChange: () => undefined,
  onGroupsSelect: () => undefined,
  disabled: false,
};

/** Reads the nearest `GroupProvider` value. Throws rather than returning
 * `undefined` so a missing provider surfaces immediately at the call
 * site instead of as a mystery null-deref several renders later. */
export function useGroup() {
  const context = useContext(GroupContext);
  if (!context) {
    throw new Error("useGroup must be used within a GroupProvider");
  }
  return context;
}

export default GroupContext;
