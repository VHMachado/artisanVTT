import cloneDeep from "lodash.clonedeep";
import { v4 as uuid } from "uuid";

import { Group, GroupContainer, GroupItem } from "../types/Group";

type Identified = { id: string };

function indexById<Type extends Identified>(items: Type[]): Map<string, Type> {
  return new Map(items.map((item) => [item.id, item]));
}

function cloneGroups(groups: Group[]): Group[] {
  return cloneDeep(groups);
}

function selectedAt<T>(items: T[], indices: number[]): T[] {
  return indices.map((index) => items[index]);
}

function withoutIds(groups: Group[], ids: Set<string>): Group[] {
  return groups.filter((group) => !ids.has(group.id));
}

export function groupsFromIds(groupIds: string[], groups: Group[]): Group[] {
  const byId = indexById(groups);
  return groupIds.flatMap((id) => {
    const group = byId.get(id);
    return group ? [group] : [];
  });
}

export function getGroupItems(group: Group): GroupItem[] {
  return group.type === "item" ? [group] : group.items.flatMap(getGroupItems);
}

export function itemsFromGroups<Item>(
  groups: Group[],
  allItems: Item[],
  itemKey = "id"
): Item[] {
  const byId = new Map<string, Item>();
  for (const item of allItems as Array<Item & Record<string, unknown>>) {
    byId.set(String(item[itemKey]), item);
  }

  return groups.flatMap((group) =>
    getGroupItems(group).map((entry) => byId.get(entry.id) as Item)
  );
}

export function combineGroups(first: Group, second: Group): GroupContainer {
  if (second.type !== "item") {
    throw new Error("Unable to combine two GroupContainers");
  }

  if (first.type === "item") {
    return { id: uuid(), type: "group", items: [first, second], name: "" };
  }

  return { ...first, items: [...first.items, second] };
}

export function moveGroupsInto(groups: Group[], into: number, indices: number[]): Group[] {
  const draft = cloneGroups(groups);
  const destination = draft[into];
  const dragged = selectedAt(draft, indices);
  const combined = dragged.reduce<Group>(combineGroups, destination);
  const retained = withoutIds(draft, new Set(dragged.map(({ id }) => id)));
  const destinationIndex = retained.findIndex(({ id }) => id === destination.id);

  retained.splice(destinationIndex < 0 ? 0 : destinationIndex, 1, combined);
  return retained;
}

export function moveGroups(groups: Group[], to: number, indices: number[]): Group[] {
  const draft = cloneGroups(groups);
  const dragged = selectedAt(draft, indices);
  const remaining = withoutIds(draft, new Set(dragged.map(({ id }) => id)));
  remaining.splice(to, 0, ...dragged);
  return remaining;
}

export function ungroup(groups: Group[], fromId: string, indices: number[]): Group[] {
  const draft = cloneGroups(groups);
  const fromIndex = draft.findIndex(({ id }) => id === fromId);
  const source = draft[fromIndex];

  if (!source || source.type !== "group") {
    throw new Error(`Unable to ungroup ${fromId}, not a group`);
  }

  const extracted = selectedAt(source.items, indices);
  const extractedIds = new Set(extracted.map(({ id }) => id));
  const remainingItems = source.items.filter(({ id }) => !extractedIds.has(id));
  const remainingGroups =
    remainingItems.length === 0
      ? [...draft.slice(0, fromIndex), ...draft.slice(fromIndex + 1)]
      : draft.map((group, index) => (index === fromIndex ? { ...source, items: remainingItems } : group));

  return [...extracted, ...remainingGroups];
}

export function findGroup(groups: Group[], groupId: string): Group | undefined {
  for (const group of groups) {
    if (group.id === groupId) {
      return group;
    }
    const match = getGroupItems(group).find(({ id }) => id === groupId);
    if (match) {
      return match;
    }
  }
  return undefined;
}

export function getItemNames<Item extends { name: string; id: string }>(items: Item[]) {
  return Object.fromEntries(items.map(({ id, name }) => [id, name]));
}

export function renameGroup(groups: Group[], groupId: string, newName: string): Group[] {
  return cloneGroups(groups).map((group) => {
    if (group.id !== groupId) {
      return group;
    }
    if (group.type !== "group") {
      throw new Error(`Unable to rename group ${groupId}, not of type group`);
    }
    return { ...group, name: newName };
  });
}

export function removeGroupsItems(groups: Group[], itemIds: string[]): Group[] {
  const removed = new Set(itemIds);
  return cloneGroups(groups).reduce<Group[]>((remaining, group) => {
    if (group.type === "item") {
      return removed.has(group.id) ? remaining : [...remaining, group];
    }

    const items = group.items.filter((item) => !removed.has(item.id));
    return items.length === 0 ? remaining : [...remaining, { ...group, items }];
  }, []);
}
