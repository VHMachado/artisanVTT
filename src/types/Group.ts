/** A single leaf entry in the group tree — a map or token that lives
 * directly at this level rather than inside a nested folder. */
export type GroupItem = { type: "item"; id: string };

/** A named folder that can nest further items (and, recursively, more
 * containers) — used by the map/token organizer sidebar. */
export type GroupContainer = { type: "group"; id: string; name: string; items: GroupItem[] };

export type Group = GroupItem | GroupContainer;
