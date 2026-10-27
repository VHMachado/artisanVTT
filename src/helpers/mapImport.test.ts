import { describe, expect, test } from "vitest";

import { filterMapsForTable } from "./mapImport";
import type { DefaultMap } from "../types/Map";

function stubMap(id: string, tableId?: string): DefaultMap {
  return {
    id,
    key: id,
    type: "default",
    name: id,
    owner: "owner",
    created: 0,
    lastModified: 0,
    height: 10,
    width: 10,
    showGrid: false,
    snapToGrid: true,
    grid: { size: { x: 10, y: 10 }, inset: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 1, y: 1 } }, type: "square", measurement: { type: "chebyshev", scale: "1.5m" } },
    tableId,
  };
}

/**
 * Bug fix (2026-10-26): maps were shared across every Mesa a GM has on
 * this device — see types/Map.ts's `tableId` doc comment. This is the
 * filter SelectMapModal.tsx applies to the picker/grouping tree.
 */
describe("filterMapsForTable", () => {
  test("keeps a map tagged with the current table", () => {
    const maps = [stubMap("a", "table-1")];
    expect(filterMapsForTable(maps, "table-1")).toEqual(maps);
  });

  test("hides a map tagged with a DIFFERENT table", () => {
    const maps = [stubMap("a", "table-1"), stubMap("b", "table-2")];
    expect(filterMapsForTable(maps, "table-1").map((m) => m.id)).toEqual(["a"]);
  });

  test("never hides a map that predates per-Mesa scoping (no tableId at all)", () => {
    const maps = [stubMap("legacy"), stubMap("other-table", "table-2")];
    expect(filterMapsForTable(maps, "table-1").map((m) => m.id)).toEqual(["legacy"]);
  });
});
