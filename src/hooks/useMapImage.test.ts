import { describe, expect, it } from "vitest";

import { canRenderBlankDefaultMap } from "./useMapImage";
import type { Map } from "../types/Map";

const legacyDefaultMap = { type: "default" } as Map;
const fileMap = { type: "file" } as Map;

describe("canRenderBlankDefaultMap", () => {
  it("keeps a legacy default map usable after its bundled image is removed", () => {
    expect(canRenderBlankDefaultMap(legacyDefaultMap, undefined)).toBe(true);
    expect(canRenderBlankDefaultMap(legacyDefaultMap, "blob:image")).toBe(false);
    expect(canRenderBlankDefaultMap(fileMap, undefined)).toBe(false);
    expect(canRenderBlankDefaultMap(null, undefined)).toBe(false);
  });
});
