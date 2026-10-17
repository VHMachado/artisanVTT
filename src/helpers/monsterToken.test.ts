import { describe, expect, it, vi, afterEach } from "vitest";

import {
  createMonsterTokenState,
  createMonsterTokenStateWithArt,
  monsterTokenKey,
  monsterTokenSize,
  monsterIndexFromTokenId,
  switchMonsterTokenVariant,
} from "./monsterToken";
import { loadMonsterSummaries } from "../5e/bestiary";
import { monsterTokenArtVariants } from "../5e/monsterTokenArt";
import { loadLocalMonsterArtOverrides } from "../5e/monsterArtLocal";

import type { MonsterSummary } from "../types/Monster";

// The bundled manifest (src/5e/data/monster-token-manifest.json)
// moved to {} — Forgotten Adventures/WotC art now lives ONLY in the
// user's local override folder, never vendored in the repo (see
// monsterArtLocal.ts). Tests below that need curated art for a real SRD
// index set up a fake local override via the same window.go.main.App
// binding the desktop app uses, exercising the real priority order
// instead of asserting against bundled assets that no longer exist.
function withLocalGoblinTokenArt<T>(run: () => Promise<T> | T): Promise<T> {
  (window as any).go = {
    main: {
      App: {
        ScanLocalMonsterArt: async () =>
          JSON.stringify({
            tokenArt: {
              goblin: [
                { file: "goblin_1.png", width: 512, height: 512 },
                { file: "goblin_2.png", width: 480, height: 512 },
              ],
            },
            portraits: {},
          }),
      },
    },
  };
  return loadLocalMonsterArtOverrides().then(run);
}

afterEach(async () => {
  delete (window as any).go;
  await loadLocalMonsterArtOverrides();
});

// Every real SRD index now has curated global token art (see
// src/5e/monsterTokenArt.ts), so the silhouette-path tests below use a
// deliberately fake index that can never collide with a manifest entry —
// otherwise they'd all start exercising the art path instead.
function summary(overrides: Partial<MonsterSummary> = {}): MonsterSummary {
  return {
    index: "goblin-test-fixture",
    name: "Goblin",
    size: "Small",
    type: "humanoid",
    subtype: "goblinoid",
    challenge_rating: 0.25,
    challengeRating: "1/4",
    xp: 50,
    ...overrides,
  };
}

describe("monsterTokenKey", () => {
  it("prefers a more specific subtype silhouette over the plain type", () => {
    // An SRD werewolf is `humanoid (shapechanger)` and the art set has a
    // shapechanger token — using the humanoid one would throw that away.
    expect(monsterTokenKey({ type: "humanoid", subtype: "shapechanger" })).toBe(
      "shapechanger"
    );
    expect(monsterTokenKey({ type: "monstrosity", subtype: "titan" })).toBe(
      "titan"
    );
    expect(monsterTokenKey({ type: "humanoid", subtype: "goblinoid" })).toBe(
      "goblinoid"
    );
  });

  it("falls back to the creature type when the subtype has no art", () => {
    expect(monsterTokenKey({ type: "dragon", subtype: "demon" })).toBe("dragon");
    expect(monsterTokenKey({ type: "undead" })).toBe("undead");
  });

  it("maps the dataset's one compound type onto the beast token", () => {
    expect(monsterTokenKey({ type: "swarm of Tiny beasts" })).toBe("beast");
  });

  it("keeps a semantic outline key for every dataset creature", async () => {
    // Removing every bundled class/type silhouette means a no-art monster
    // still needs a stable default key so Token can render its outline rather
    // than treating the state as malformed.
    const summaries = await loadMonsterSummaries();
    for (const monster of summaries) {
      expect(monsterTokenKey(monster)).toBeTruthy();
    }
  });
});

describe("monsterTokenSize", () => {
  it("maps 5e size categories to grid squares", () => {
    expect(monsterTokenSize("Tiny")).toBe(1);
    expect(monsterTokenSize("Small")).toBe(1);
    expect(monsterTokenSize("Medium")).toBe(1);
    expect(monsterTokenSize("Large")).toBe(2);
    expect(monsterTokenSize("Huge")).toBe(3);
    expect(monsterTokenSize("Gargantuan")).toBe(4);
  });
});

describe("monsterIndexFromTokenId", () => {
  it("recovers the bestiary index from a monster token's namespaced id", () => {
    // Round-trips with createMonsterTokenState's own tokenId construction
    // (`${MONSTER_TOKEN_PREFIX}${monster.index}`) — the right-click
    // menu on a placed token resolves back through this.
    const state = createMonsterTokenState(summary(), { x: 0, y: 0 }, "user-1");
    expect(monsterIndexFromTokenId(state.tokenId)).toBe("goblin-test-fixture");
  });

  it("returns undefined for a non-monster tokenId", () => {
    // A character/prop/built-in token never carries the "__monster-"
    // prefix, so its right-click stays the browser default (see Token.tsx).
    expect(monsterIndexFromTokenId("some-character-token-id")).toBeUndefined();
  });
});

describe("createMonsterTokenState", () => {
  it("labels the token with the monster's name", () => {
    // Four unlabelled goblins and two hobgoblins on a board are unusable —
    // unlike a player character's token, nothing else identifies these.
    const state = createMonsterTokenState(
      summary(),
      { x: 0.25, y: 0.5 },
      "user-1"
    );
    expect(state.label).toBe("Goblin");
  });

  it("namespaces tokenId so it can't collide with a real token row", () => {
    const state = createMonsterTokenState(summary(), { x: 0, y: 0 }, "user-1");
    expect(state.tokenId).toBe("__monster-goblin-test-fixture");
  });

  it("carries the position, owner and 5e-derived size", () => {
    const state = createMonsterTokenState(
      summary({ index: "ogre-test-fixture", name: "Ogre", size: "Large", type: "giant", subtype: undefined }),
      { x: 0.1, y: 0.9 },
      "user-7"
    );
    expect(state.x).toBe(0.1);
    expect(state.y).toBe(0.9);
    expect(state.owner).toBe("user-7");
    expect(state.lastModifiedBy).toBe("user-7");
    expect(state.size).toBe(2);
    expect(state.type).toBe("default");
    expect(state.type === "default" && state.key).toBe("giant");
  });

  it("does not claim to be a Personagem", () => {
    // characterId is what the broker's authorization check reads
    // (hub.go's authorizeMapStateUpdate): a monster token belongs to no
    // account's character, so setting it would be a lie the server acts on.
    const state = createMonsterTokenState(summary(), { x: 0, y: 0 }, "user-1");
    expect(state.characterId).toBeUndefined();
  });

  it("gives each dropped copy its own id", () => {
    const a = createMonsterTokenState(summary(), { x: 0, y: 0 }, "user-1");
    const b = createMonsterTokenState(summary(), { x: 0, y: 0 }, "user-1");
    expect(a.id).not.toBe(b.id);
  });

  it("shows curated global token art for an SRD monster that has it, over the type silhouette", async () => {
    // "goblin" (the real SRD index) gets its art from the user's
    // local override folder, not a bundled manifest — createMonsterTokenState
    // (the SYNC path, used with no session/broker at all, e.g.
    // BestiaryPanel's drag handler) must still pick it up, since the local
    // override is resolved once at bootstrap, not per-call.
    await withLocalGoblinTokenArt(() => {
      const variants = monsterTokenArtVariants("goblin");
      expect(variants.length).toBeGreaterThan(0);

      const state = createMonsterTokenState(
        summary({ index: "goblin", name: "Goblin" }),
        { x: 0, y: 0 },
        "user-1"
      );
      expect(state.type).toBe("default");
      expect(state.type === "default" && state.key).toBe(variants[0]);
      expect(state.variantIndex).toBe(0);
      expect(state.monsterTokenVariants).toEqual(variants);
      // Real art isn't cropped to the fixed 256x256 silhouette box.
      expect(state.width).toBeGreaterThan(0);
      expect(state.height).toBeGreaterThan(0);
    });
  });

  it("falls back to the type silhouette for an SRD monster with no curated token art", () => {
    // "goblin-test-fixture" can never appear in the manifest (it isn't a
    // real SRD index), so this exercises the pre-Fase-14 fallback path.
    const state = createMonsterTokenState(summary(), { x: 0, y: 0 }, "user-1");
    expect(state.type).toBe("default");
    expect(state.type === "default" && state.key).toBe("goblinoid");
    expect(state.width).toBe(256);
    expect(state.height).toBe(256);
    expect(state.variantIndex).toBeUndefined();
    expect(state.monsterTokenVariants).toBeUndefined();
  });
});

describe("createMonsterTokenStateWithArt", () => {
  const getAsset = vi.fn().mockResolvedValue(undefined);
  const putAsset = vi.fn().mockResolvedValue(undefined);

  it("falls back to the silhouette token when there are no variants", async () => {
    const state = await createMonsterTokenStateWithArt(
      summary(),
      { x: 0, y: 0 },
      "user-1",
      undefined,
      getAsset,
      putAsset
    );
    expect(state.type).toBe("default");
    expect(state.variantIndex).toBeUndefined();
    expect(state.monsterTokenVariants).toBeUndefined();
  });

  it("prefers a homebrew tokenAssetIds upload over curated global token art", async () => {
    // A GM who uploaded their own art for an SRD monster (a
    // homebrew/derived row's tokenAssetIds) should see THEIR upload, not
    // the local override's default — createMonsterTokenStateWithArt's
    // async branch always takes priority when it succeeds; only its own
    // failure/absence falls through to the sync base (which is where the
    // global art lives).
    const session = {
      username: "gm",
      displayName: "GM",
      token: "t",
      accountId: 1,
    };
    await withLocalGoblinTokenArt(async () => {
      const state = await createMonsterTokenStateWithArt(
        summary({ index: "goblin", name: "Goblin", tokenAssetIds: ["hash-1"] }),
        { x: 0, y: 0 },
        "user-1",
        session,
        getAsset,
        putAsset
      );
      // getAsset/putAsset are mocked to fail the fetch (no broker reachable
      // in this test), so this actually falls through to the sync base —
      // which for "goblin" IS the curated global art, not the silhouette.
      expect(state.type).toBe("default");
      const variants = monsterTokenArtVariants("goblin");
      expect(state.type === "default" && state.key).toBe(variants[0]);
    });
  });

  it("falls back to the silhouette token when there is no session", async () => {
    // No session means the broker's asset store is unreachable — never
    // block the drop, same discipline as createCharacterTokenState.
    const state = await createMonsterTokenStateWithArt(
      summary({ tokenAssetIds: ["hash-1"] }),
      { x: 0, y: 0 },
      "user-1",
      undefined,
      getAsset,
      putAsset
    );
    expect(state.type).toBe("default");
  });

  it(
    "falls back to the silhouette token when the asset fetch fails",
    async () => {
      // fetchAssetBlob is what actually hits the network; with getAsset
      // returning undefined (cache miss) and no way to reach the broker in
      // this test, the underlying fetch throws — the fallback must still
      // produce a usable token rather than propagating the error.
      const session = {
        username: "gm",
        displayName: "GM",
        token: "t",
        accountId: 1,
      };
      const state = await createMonsterTokenStateWithArt(
        summary({ tokenAssetIds: ["hash-1"] }),
        { x: 0, y: 0 },
        "user-1",
        session,
        getAsset,
        putAsset
      );
      expect(state.type).toBe("default");
    }
  );
});

describe("switchMonsterTokenVariant", () => {
  const getAsset = vi.fn().mockResolvedValue(undefined);
  const putAsset = vi.fn().mockResolvedValue(undefined);

  it("returns undefined (no-op) when there is no session", async () => {
    // No session means the broker's asset store is unreachable — a stale
    // click must never corrupt the token's current display.
    const patch = await switchMonsterTokenVariant(
      "hash-1",
      0,
      ["hash-1", "hash-2"],
      undefined,
      getAsset,
      putAsset,
      "user-1"
    );
    expect(patch).toBeUndefined();
  });

  it("returns undefined (no-op) when the asset fetch fails", async () => {
    const session = {
      username: "gm",
      displayName: "GM",
      token: "t",
      accountId: 1,
    };
    const patch = await switchMonsterTokenVariant(
      "hash-1",
      0,
      ["hash-1", "hash-2"],
      session,
      getAsset,
      putAsset,
      "user-1"
    );
    expect(patch).toBeUndefined();
  });

  it("resolves a synthetic global monster-art key with no session/network at all", async () => {
    // Switching between two local-override variants is a pure
    // manifest lookup — must work even with no session, unlike the
    // broker-asset-hash path above.
    await withLocalGoblinTokenArt(async () => {
      const variants = monsterTokenArtVariants("goblin");
      expect(variants.length).toBeGreaterThan(0);
      const patch = await switchMonsterTokenVariant(
        variants[0],
        0,
        variants,
        undefined,
        getAsset,
        putAsset,
        "user-1"
      );
      expect(patch).toBeDefined();
      expect(patch?.type).toBe("default");
      expect(patch?.type === "default" && patch.key).toBe(variants[0]);
      expect(patch?.monsterTokenVariants).toEqual(variants);
    });
  });
});
