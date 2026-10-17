import { describe, expect, test } from "vitest";

import { initiativeBonusForToken, rollD20, suggestedMaxHpForToken } from "./initiativeRoll";

import type { TokenState } from "../types/TokenState";

/**
 * Pedido do usuário (2026-10-12, segunda rodada): "Adicionar
 * automaticamente 1d20 + bônus de iniciativa da ficha" e "HP máximo
 * puxado direto da ficha".
 */

function minimalToken(
  overrides: Partial<Omit<TokenState, "type" | "key">> = {}
): TokenState {
  return {
    id: "token-1",
    tokenId: "tok-1",
    owner: "user-1",
    size: 1,
    category: "character",
    label: "Token",
    statuses: [],
    x: 0,
    y: 0,
    lastModifiedBy: "user-1",
    lastModified: 0,
    rotation: 0,
    locked: false,
    visible: true,
    outline: { type: "circle", x: 0, y: 0, radius: 1 },
    width: 1,
    height: 1,
    type: "default",
    key: "__default-token",
    ...overrides,
  };
}

describe("rollD20", () => {
  test("always rolls between 1 and 20 inclusive", () => {
    for (let i = 0; i < 200; i++) {
      const roll = rollD20();
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(20);
      expect(Number.isInteger(roll)).toBe(true);
    }
  });
});

describe("initiativeBonusForToken", () => {
  test("uses the DEX modifier for a real SRD monster token", async () => {
    // "goblin" is a real SRD slug (DEX 14 -> +2) — namespaced the same
    // way helpers/monsterToken.ts's createMonsterTokenState does.
    const token = minimalToken({ tokenId: "__monster-goblin" });
    expect(await initiativeBonusForToken(token)).toBe(2);
  });

  test("is 0 for a prop/vehicle token with no character/monster link", async () => {
    const token = minimalToken({ tokenId: "some-plain-file-token" });
    expect(await initiativeBonusForToken(token)).toBe(0);
  });

  test(
    "is 0 (never throws) for a characterId whose sheet can't be read " +
      "in this environment (no IndexedDB)",
    async () => {
      const token = minimalToken({ characterId: "character-1" });
      expect(await initiativeBonusForToken(token)).toBe(0);
    }
  );
});

describe("suggestedMaxHpForToken", () => {
  test("suggests the real SRD monster's hit_points", async () => {
    const token = minimalToken({ tokenId: "__monster-goblin" });
    // SRD goblin: 7 HP (2d6).
    expect(await suggestedMaxHpForToken(token)).toBe(7);
  });

  test("is undefined for a token with no resolvable source", async () => {
    const token = minimalToken({ tokenId: "some-plain-file-token" });
    expect(await suggestedMaxHpForToken(token)).toBeUndefined();
  });
});
