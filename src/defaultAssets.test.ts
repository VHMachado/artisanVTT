import { describe, expect, it } from "vitest";

import { getDefaultMaps, mapSources } from "./maps";
import { getDefaultTokens, tokenSources } from "./tokens";

describe("bundled sample assets", () => {
  it("does not seed maps or tokens for a new library", () => {
    expect(mapSources).toEqual({});
    expect(tokenSources).toEqual({});
    expect(getDefaultMaps("user-1")).toEqual({ maps: [], mapStates: [] });
    expect(getDefaultTokens("user-1")).toEqual([]);
  });
});
