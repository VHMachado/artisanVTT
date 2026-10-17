import { describe, expect, it } from "vitest";

import { selectShelfGroupIds } from "../state/artisanStore";

const groups = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

describe("selectShelfGroupIds", () => {
  it("replaces the selection in single-select mode", () => {
    expect(selectShelfGroupIds(["a", "b"], "single", groups, "c")).toEqual([
      "c",
    ]);
  });

  it("toggles only the clicked tile in multi-select mode", () => {
    expect(selectShelfGroupIds(["a"], "multiple", groups, "c")).toEqual([
      "a",
      "c",
    ]);
    expect(selectShelfGroupIds(["a", "c"], "multiple", groups, "c")).toEqual([
      "a",
    ]);
  });

  it("toggles the contiguous range from the previous selection", () => {
    expect(selectShelfGroupIds(["b"], "range", groups, "d")).toEqual([
      "b",
      "c",
      "d",
    ]);
    expect(
      selectShelfGroupIds(["b", "c", "d"], "range", groups, "c")
    ).toEqual(["b", "d"]);
  });
});
