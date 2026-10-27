import { describe, expect, test } from "vitest";

import { removeGroupsItems, restoreHiddenGroups } from "./groupOperations";
import type { Group } from "../types/Group";

const item = (id: string): Group => ({ id, type: "item" });
const folder = (id: string, items: Group[]): Group => ({ id, type: "group", name: id, items: items as never });

/**
 * Bug fix (2026-10-26): SelectMapModal.tsx scopes the picker to one
 * Mesa's maps by handing `GroupProvider` a tree already pruned of every
 * other-Mesa id (`removeGroupsItems`), then has to merge any edit the
 * user makes back into the FULL tree (`restoreHiddenGroups`) before
 * persisting — getting this wrong silently deletes another Mesa's
 * folders/order the moment anyone reorders a map in a DIFFERENT Mesa.
 */
describe("restoreHiddenGroups", () => {
  test("round-trips an edit with no hidden ids back to itself", () => {
    const original = [item("a"), item("b")];
    const edited = [item("b"), item("a")];
    expect(restoreHiddenGroups(original, edited, [])).toEqual(edited);
  });

  test("re-appends a hidden top-level item dropped by removeGroupsItems, after the edit", () => {
    const original = [item("visible-1"), item("hidden-1"), item("visible-2")];
    const scoped = removeGroupsItems(original, ["hidden-1"]);
    expect(scoped).toEqual([item("visible-1"), item("visible-2")]);

    // User reorders the (only) two maps they can see...
    const edited = [item("visible-2"), item("visible-1")];
    // ...and the hidden map comes back, unaffected, rather than vanishing.
    const restored = restoreHiddenGroups(original, edited, ["hidden-1"]);
    expect(restored).toEqual([item("visible-2"), item("visible-1"), item("hidden-1")]);
  });

  test("re-appends a hidden top-level FOLDER (every item inside it hidden)", () => {
    const original = [item("visible-1"), folder("other-table-folder", [item("hidden-1"), item("hidden-2")])];
    const hiddenIds = ["hidden-1", "hidden-2"];
    const scoped = removeGroupsItems(original, hiddenIds);
    expect(scoped).toEqual([item("visible-1")]);

    const restored = restoreHiddenGroups(original, scoped, hiddenIds);
    expect(restored).toEqual(original);
  });

  test("does not duplicate a folder that still has a visible item left in it", () => {
    // A folder mixing a visible and a hidden id (not reachable through
    // normal use, see restoreHiddenGroups' doc comment) keeps its
    // visible item via removeGroupsItems; restoreHiddenGroups must not
    // ALSO re-add the folder (it isn't "entirely hidden"), or the
    // visible item would appear twice.
    const original = [folder("mixed", [item("visible-1"), item("hidden-1")])];
    const scoped = removeGroupsItems(original, ["hidden-1"]);
    expect(scoped).toEqual([folder("mixed", [item("visible-1")])]);

    const restored = restoreHiddenGroups(original, scoped, ["hidden-1"]);
    expect(restored).toEqual([folder("mixed", [item("visible-1")])]);
  });
});
