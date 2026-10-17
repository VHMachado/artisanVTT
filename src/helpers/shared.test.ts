import { describe, expect, it, vi } from "vitest";

import {
  fromEntries,
  groupBy,
  isEmpty,
  keyBy,
  lerp,
  omit,
  roundTo,
  shuffle,
} from "./shared";

describe("shared helpers", () => {
  it("omits requested enumerable keys without changing the source", () => {
    const source = { keep: 1, remove: 2 };

    expect(omit(source, ["remove"])).toEqual({ keep: 1 });
    expect(source).toEqual({ keep: 1, remove: 2 });
  });

  it("builds records from entries and object-array keys", () => {
    const values = [
      { id: "a", group: "x" },
      { id: "b", group: "x" },
      { id: "c", group: "y" },
    ];

    expect(fromEntries([[1, "one"], ["two", 2]])).toEqual({ 1: "one", two: 2 });
    expect(keyBy(values, "id")).toEqual({ a: values[0], b: values[1], c: values[2] });
    expect(groupBy(values, "group")).toEqual({ x: values.slice(0, 2), y: [values[2]] });
  });

  it("retains numeric helper and empty-object contracts", () => {
    expect(roundTo(14, 5)).toBe(15);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(isEmpty({})).toBe(true);
    expect(isEmpty([])).toBe(false);
  });

  it("returns a new Fisher-Yates permutation", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const source = [1, 2, 3];

    expect(shuffle(source)).toEqual([2, 3, 1]);
    expect(source).toEqual([1, 2, 3]);
    vi.restoreAllMocks();
  });
});
