import { describe, expect, it } from "vitest";

import { relocateClipboard, selectionClipboard } from "./selectionClipboard";

const token = {
  id: "token-a",
  x: 0.1,
  y: 0.2,
  label: "Scout",
} as any;

const selection = {
  type: "rectangle" as const,
  items: [{ id: "token-a", type: "token" as const }],
  x: 0,
  y: 0,
  data: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
};

const mapState = {
  mapId: "map-a",
  tokens: { "token-a": token, ignored: { ...token, id: "ignored" } },
  fogs: {},
  editFlags: [],
} as any;

describe("selection clipboard", () => {
  it("copies only the selected token states", () => {
    const payload = selectionClipboard("test-version", selection, mapState);

    expect(payload).toEqual({
      version: "test-version",
      selection,
      data: { mapId: "map-a", tokens: { "token-a": token }, fogs: {}, editFlags: [] },
    });
  });

  it("relocates copied tokens around the destination centroid and assigns fresh ids", () => {
    const payload = selectionClipboard("test-version", selection, mapState);
    const relocated = relocateClipboard(payload, { x: 0.6, y: 0.7 }, () => "new-token");

    expect(relocated.tokens).toHaveLength(1);
    expect(relocated.tokens[0]).toMatchObject({ id: "new-token", label: "Scout" });
    expect(relocated.tokens[0].x).toBeCloseTo(0.5);
    expect(relocated.tokens[0].y).toBeCloseTo(0.6);
    expect(relocated.selection).toMatchObject({
      type: selection.type,
      data: selection.data,
      items: [{ id: "new-token", type: "token" }],
    });
    expect(relocated.selection.x).toBeCloseTo(0.4);
    expect(relocated.selection.y).toBeCloseTo(0.4);
  });
});
