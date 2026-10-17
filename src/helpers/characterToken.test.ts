import { describe, expect, it, vi } from "vitest";

import { createCharacterTokenState } from "./characterToken";

import type { Character } from "../types/Character";

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: "character-1",
    tableId: "table-1",
    name: "Aragorn",
    ownerAccountId: 1,
    sheet: "{}",
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    deleted: false,
    ...overrides,
  };
}

describe("createCharacterTokenState", () => {
  it("labels a dropped character token with the character's name", async () => {
    const state = await createCharacterTokenState(
      character(),
      undefined,
      vi.fn(),
      vi.fn(),
      { x: 0.25, y: 0.5 },
      "user-1"
    );

    expect(state.label).toBe("Aragorn");
  });
});
