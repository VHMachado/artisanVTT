import { describe, expect, it } from "vitest";

import { moveGroups, moveGroupsInto, ungroup } from "./group";
import { Group, GroupItem } from "../types/Group";

function item(id: string): GroupItem {
  return { id, type: "item" };
}

describe("tile shelf group operations", () => {
  it("keeps the dragged tiles in their relative order when reordering", () => {
    const groups: Group[] = [item("a"), item("b"), item("c"), item("d")];

    expect(moveGroups(groups, 3, [0, 2]).map((group) => group.id)).toEqual([
      "b",
      "d",
      "a",
      "c",
    ]);
  });

  it("creates a group when dropping one tile over another", () => {
    const groups: Group[] = [item("a"), item("b"), item("c")];
    const result = moveGroupsInto(groups, 1, [0]);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("group");
    if (result[0].type === "group") {
      expect(result[0].items.map((entry) => entry.id)).toEqual(["b", "a"]);
    }
    expect(result[1].id).toBe("c");
  });

  it("returns selected children to the start of the shelf when ungrouped", () => {
    const groups: Group[] = [
      item("a"),
      { id: "g", type: "group", name: "Encounter", items: [item("b"), item("c")] },
    ];

    const result = ungroup(groups, "g", [1]);

    expect(result.map((group) => group.id)).toEqual(["c", "a", "g"]);
    expect(result[2]).toMatchObject({ type: "group", items: [{ id: "b" }] });
  });
});
