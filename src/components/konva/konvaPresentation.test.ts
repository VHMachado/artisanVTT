import { describe, expect, it } from "vitest";

import {
  attachmentHandleLayout,
  formatRulerReadout,
  labelBoxPadding,
  labelFontScale,
  trailPolygon,
} from "./konvaPresentation";

describe("labelBoxPadding", () => {
  it("caps the label padding at the visual size of a three-cell token", () => {
    expect(labelBoxPadding(120, 6)).toEqual({ x: 7.5, y: 5 });
  });
});

describe("labelFontScale", () => {
  it("chooses the largest candidate that still fits the available width", () => {
    const scale = labelFontScale({
      height: 100,
      tokenSize: 1,
      setting: 1,
      availableWidth: 41,
      horizontalPadding: 4,
      measure: (fontSize) => fontSize * 2,
    });

    expect(scale).toBeCloseTo((100 / 7) / 144);
  });

  it("falls back to the minimum visual size when no candidate fits", () => {
    expect(
      labelFontScale({
        height: 100,
        tokenSize: 1,
        setting: 1,
        availableWidth: 1,
        horizontalPadding: 4,
        measure: () => 100,
      })
    ).toBeCloseTo(1 / 144);
  });
});

describe("formatRulerReadout", () => {
  it("keeps the singular square label and configured decimal precision", () => {
    expect(
      formatRulerReadout(1.04, { multiplier: 1.5, digits: 1, unit: "m" })
    ).toBe("1 quadrado (1.6m)");
  });

  it("pluralizes rounded square counts", () => {
    expect(
      formatRulerReadout(2.49, { multiplier: 5, digits: 0, unit: "ft" })
    ).toBe("2 quadrados (12ft)");
  });
});

describe("attachmentHandleLayout", () => {
  it("centers the visible attachment grip on the lower edge", () => {
    expect(attachmentHandleLayout(100, 30)).toEqual({
      hitbox: { x: -10, y: 46.25, width: 20, height: 7.5 },
      grip: { x: -5, y: 48.125, width: 10, height: 3.75 },
    });
  });
});

describe("trailPolygon", () => {
  it("returns an empty path for an empty trail", () => {
    expect(trailPolygon([], 20)).toEqual([]);
  });

  it("builds a closed outline around a resampled pointer trail", () => {
    const path = trailPolygon(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      10
    );

    expect(path).toHaveLength(4);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[1].y).toBeLessThan(0);
    expect(path[2].y).toBeGreaterThan(0);
    expect(path[3]).toEqual({ x: 0, y: 0 });
  });
});
