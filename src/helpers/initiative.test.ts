import { describe, expect, test } from "vitest";

import {
  activeEntryTokenId,
  combatElapsedSeconds,
  emptyInitiativeState,
  entryFromToken,
  formatCombatTime,
  resolveInitiativeEntry,
  sortedInitiativeEntries,
  withAddedEntry,
  withAddedTokenEntries,
  withClearedInitiative,
  withNextTurn,
  withPrunedTokenEntries,
  withRemovedEntry,
  withUpdatedEntry,
} from "./initiative";

import type { InitiativeState } from "../types/Initiative";
import type { TokenState } from "../types/TokenState";

describe("emptyInitiativeState", () => {
  test("starts with no entries and no active turn", () => {
    const state = emptyInitiativeState("table-1");
    expect(state).toEqual({ tableId: "table-1", entries: [] });
  });
});

describe("sortedInitiativeEntries", () => {
  test("sorts highest initiative first", () => {
    const state: InitiativeState = {
      tableId: "table-1",
      entries: [
        { id: "a", name: "Goblin", initiative: 8, hp: 7, maxHp: 7 },
        { id: "b", name: "Fighter", initiative: 18, hp: 30, maxHp: 30 },
        { id: "c", name: "Wizard", initiative: 12, hp: 12, maxHp: 12 },
      ],
    };
    expect(sortedInitiativeEntries(state).map((e) => e.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  test("returns an empty array for null state", () => {
    expect(sortedInitiativeEntries(null)).toEqual([]);
  });

  test("does not mutate the original entries array", () => {
    const state: InitiativeState = {
      tableId: "table-1",
      entries: [
        { id: "a", name: "Goblin", initiative: 8, hp: 7, maxHp: 7 },
        { id: "b", name: "Fighter", initiative: 18, hp: 30, maxHp: 30 },
      ],
    };
    const originalOrder = state.entries.map((e) => e.id);
    sortedInitiativeEntries(state);
    expect(state.entries.map((e) => e.id)).toEqual(originalOrder);
  });
});

describe("withAddedEntry", () => {
  test("appends a new entry with a generated id", () => {
    const state = withAddedEntry(null, "table-1", {
      name: "Goblin",
      initiative: 8,
      hp: 7,
      maxHp: 7,
    });
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].name).toBe("Goblin");
    expect(state.entries[0].id).toBeTruthy();
  });

  test("preserves existing entries and the active turn", () => {
    const existing: InitiativeState = {
      tableId: "table-1",
      entries: [{ id: "a", name: "Fighter", initiative: 18, hp: 30, maxHp: 30 }],
      activeEntryId: "a",
    };
    const state = withAddedEntry(existing, "table-1", {
      name: "Goblin",
      initiative: 8,
      hp: 7,
      maxHp: 7,
    });
    expect(state.entries).toHaveLength(2);
    expect(state.activeEntryId).toBe("a");
  });
});

describe("withUpdatedEntry", () => {
  test("patches only the targeted entry's fields", () => {
    const state: InitiativeState = {
      tableId: "table-1",
      entries: [
        { id: "a", name: "Goblin", initiative: 8, hp: 7, maxHp: 7 },
        { id: "b", name: "Fighter", initiative: 18, hp: 30, maxHp: 30 },
      ],
    };
    const updated = withUpdatedEntry(state, "table-1", "a", { hp: 3 });
    expect(updated.entries.find((e) => e.id === "a")?.hp).toBe(3);
    expect(updated.entries.find((e) => e.id === "b")?.hp).toBe(30);
  });

  test("an unknown id leaves every entry unchanged", () => {
    const state: InitiativeState = {
      tableId: "table-1",
      entries: [{ id: "a", name: "Goblin", initiative: 8, hp: 7, maxHp: 7 }],
    };
    const updated = withUpdatedEntry(state, "table-1", "ghost", { hp: 0 });
    expect(updated.entries).toEqual(state.entries);
  });
});

describe("withRemovedEntry", () => {
  test("removes the entry by id", () => {
    const state: InitiativeState = {
      tableId: "table-1",
      entries: [
        { id: "a", name: "Goblin", initiative: 8, hp: 7, maxHp: 7 },
        { id: "b", name: "Fighter", initiative: 18, hp: 30, maxHp: 30 },
      ],
    };
    const updated = withRemovedEntry(state, "table-1", "a");
    expect(updated.entries.map((e) => e.id)).toEqual(["b"]);
  });

  test("clears activeEntryId when removing the active combatant", () => {
    const state: InitiativeState = {
      tableId: "table-1",
      entries: [{ id: "a", name: "Goblin", initiative: 8, hp: 7, maxHp: 7 }],
      activeEntryId: "a",
    };
    const updated = withRemovedEntry(state, "table-1", "a");
    expect(updated.activeEntryId).toBeUndefined();
  });

  test("leaves activeEntryId alone when removing a different entry", () => {
    const state: InitiativeState = {
      tableId: "table-1",
      entries: [
        { id: "a", name: "Goblin", initiative: 8, hp: 7, maxHp: 7 },
        { id: "b", name: "Fighter", initiative: 18, hp: 30, maxHp: 30 },
      ],
      activeEntryId: "b",
    };
    const updated = withRemovedEntry(state, "table-1", "a");
    expect(updated.activeEntryId).toBe("b");
  });
});

describe("withNextTurn", () => {
  const state: InitiativeState = {
    tableId: "table-1",
    entries: [
      { id: "a", name: "Goblin", initiative: 8, hp: 7, maxHp: 7 },
      { id: "b", name: "Fighter", initiative: 18, hp: 30, maxHp: 30 },
      { id: "c", name: "Wizard", initiative: 12, hp: 12, maxHp: 12 },
    ],
  };

  test("starts at the top of initiative order when nothing is active", () => {
    const updated = withNextTurn(state, "table-1");
    expect(updated.activeEntryId).toBe("b");
  });

  test("starting combat does NOT count as completing a round", () => {
    // Pedido do usuário: "uma rodada passa quando o turno de todos já
    // passou" — começar o combate (ninguém teve turno ainda) pousa no
    // topo da ordem (índice 0) só porque é o PRIMEIRO turno, não porque
    // uma rodada completa já passou.
    const updated = withNextTurn(state, "table-1");
    expect(updated.round).toBe(1);
  });

  test("advances to the next entry in initiative order", () => {
    const updated = withNextTurn({ ...state, activeEntryId: "b" }, "table-1");
    expect(updated.activeEntryId).toBe("c");
  });

  test("does not bump round when advancing WITHIN the order", () => {
    const updated = withNextTurn(
      { ...state, activeEntryId: "b", round: 3 },
      "table-1"
    );
    expect(updated.round).toBe(3);
  });

  test("wraps back to the top after the last entry", () => {
    const updated = withNextTurn({ ...state, activeEntryId: "a" }, "table-1");
    expect(updated.activeEntryId).toBe("b");
  });

  test("bumps round when wrapping from the LAST combatant back to the FIRST", () => {
    const updated = withNextTurn({ ...state, activeEntryId: "a" }, "table-1");
    expect(updated.round).toBe(2);
  });

  test("bumps round repeatedly across several full laps", () => {
    let current = state;
    for (let lap = 0; lap < 3; lap++) {
      current = withNextTurn(current, "table-1"); // b
      current = withNextTurn(current, "table-1"); // c
      current = withNextTurn(current, "table-1"); // a (wraps to b next)
      current = withNextTurn(current, "table-1"); // b, wraps -> round++
    }
    expect(current.round).toBe(4);
  });

  test("restarts at the top when the previously active entry is gone", () => {
    const updated = withNextTurn(
      { ...state, activeEntryId: "ghost" },
      "table-1"
    );
    expect(updated.activeEntryId).toBe("b");
  });

  test("clears activeEntryId when the list is empty", () => {
    const updated = withNextTurn(emptyInitiativeState("table-1"), "table-1");
    expect(updated.activeEntryId).toBeUndefined();
  });

  test(
    "a single-combatant order still bumps round every call " +
      "(that combatant's turn passing IS everyone's turn passing)",
    () => {
      const solo: InitiativeState = {
        tableId: "table-1",
        entries: [{ id: "a", name: "Solo", initiative: 10, hp: 10, maxHp: 10 }],
      };
      const first = withNextTurn(solo, "table-1");
      expect(first.round).toBe(1);
      const second = withNextTurn(first, "table-1");
      expect(second.round).toBe(2);
    }
  );
});

describe("withClearedInitiative", () => {
  test("resets to an empty list with no active turn", () => {
    expect(withClearedInitiative("table-1")).toEqual({
      tableId: "table-1",
      entries: [],
    });
  });
});

/**
 * Pedido do usuário (2026-10-12) — tokens do mapa adicionados
 * diretamente ao Combat Tracker, com vínculo permanente.
 */
function minimalToken(
  id: string,
  overrides: Partial<Omit<TokenState, "type" | "key">> = {}
): TokenState {
  return {
    id,
    tokenId: `tok-${id}`,
    owner: "user-1",
    size: 1,
    category: "character",
    label: `Token ${id}`,
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

describe("entryFromToken", () => {
  test("usa o label do token como nome e hp.current/hp.max do token", () => {
    const token = minimalToken("a", {
      label: "Goblin",
      hp: { current: 5, max: 7 },
    });
    expect(entryFromToken(token)).toEqual({
      name: "Goblin",
      initiative: 0,
      hp: 5,
      maxHp: 7,
      tokenId: "a",
    });
  });

  test("usa 0/0 quando o token não tem hp, e 'Token' quando não tem label", () => {
    const token = minimalToken("a", { label: "" });
    expect(entryFromToken(token)).toEqual({
      name: "Token",
      initiative: 0,
      hp: 0,
      maxHp: 0,
      tokenId: "a",
    });
  });
});

describe("withAddedTokenEntries", () => {
  test("adiciona uma entrada por token", () => {
    const tokens = [minimalToken("a"), minimalToken("b")];
    const state = withAddedTokenEntries(null, "table-1", tokens);
    expect(state.entries).toHaveLength(2);
    expect(state.entries.map((e) => e.tokenId)).toEqual(["a", "b"]);
  });

  test("pula um token já vinculado a uma entrada existente", () => {
    const existing: InitiativeState = {
      tableId: "table-1",
      entries: [{ id: "e1", name: "Goblin", initiative: 0, hp: 0, maxHp: 0, tokenId: "a" }],
    };
    const state = withAddedTokenEntries(existing, "table-1", [
      minimalToken("a"),
      minimalToken("b"),
    ]);
    expect(state.entries).toHaveLength(2);
    expect(state.entries.filter((e) => e.tokenId === "a")).toHaveLength(1);
  });

  test("devolve a MESMA referência quando todo token já está vinculado", () => {
    const existing: InitiativeState = {
      tableId: "table-1",
      entries: [{ id: "e1", name: "Goblin", initiative: 0, hp: 0, maxHp: 0, tokenId: "a" }],
    };
    const state = withAddedTokenEntries(existing, "table-1", [minimalToken("a")]);
    expect(state).toBe(existing);
  });
});

describe("withPrunedTokenEntries", () => {
  test("remove a entrada cujo token não existe mais no mapa", () => {
    const state: InitiativeState = {
      tableId: "table-1",
      entries: [
        { id: "e1", name: "Goblin", initiative: 0, hp: 0, maxHp: 0, tokenId: "a" },
        { id: "e2", name: "Fighter", initiative: 10, hp: 30, maxHp: 30 },
      ],
    };
    const pruned = withPrunedTokenEntries(state, "table-1", new Set());
    expect(pruned.entries.map((e) => e.id)).toEqual(["e2"]);
  });

  test("nunca remove uma entrada free-typed (sem tokenId)", () => {
    const state: InitiativeState = {
      tableId: "table-1",
      entries: [{ id: "e1", name: "Fighter", initiative: 10, hp: 30, maxHp: 30 }],
    };
    const pruned = withPrunedTokenEntries(state, "table-1", new Set());
    expect(pruned).toBe(state);
  });

  test("limpa activeEntryId quando a entrada ativa é removida pela poda", () => {
    const state: InitiativeState = {
      tableId: "table-1",
      entries: [{ id: "e1", name: "Goblin", initiative: 0, hp: 0, maxHp: 0, tokenId: "a" }],
      activeEntryId: "e1",
    };
    const pruned = withPrunedTokenEntries(state, "table-1", new Set());
    expect(pruned.activeEntryId).toBeUndefined();
  });

  test("devolve a MESMA referência quando nada está obsoleto", () => {
    const state: InitiativeState = {
      tableId: "table-1",
      entries: [{ id: "e1", name: "Goblin", initiative: 0, hp: 0, maxHp: 0, tokenId: "a" }],
    };
    const pruned = withPrunedTokenEntries(state, "table-1", new Set(["a"]));
    expect(pruned).toBe(state);
  });
});

describe("resolveInitiativeEntry", () => {
  test("uma entrada vinculada espelha o nome/hp ATUAL do token, não o snapshot", () => {
    const entry = { id: "e1", name: "Stale", initiative: 0, hp: 1, maxHp: 1, tokenId: "a" };
    const mapState = {
      tokens: { a: minimalToken("a", { label: "Goblin", hp: { current: 4, max: 7 } }) },
      fogs: {},
      editFlags: [],
      mapId: "map-1",
    };
    expect(resolveInitiativeEntry(entry, mapState)).toEqual({
      ...entry,
      name: "Goblin",
      hp: 4,
      maxHp: 7,
    });
  });

  test("uma entrada free-typed (sem tokenId) é devolvida sem alteração", () => {
    const entry = { id: "e1", name: "Fighter", initiative: 10, hp: 30, maxHp: 30 };
    expect(resolveInitiativeEntry(entry, null)).toBe(entry);
  });

  test("uma entrada vinculada cujo token não existe mais cai no fallback armazenado", () => {
    const entry = { id: "e1", name: "Goblin", initiative: 0, hp: 5, maxHp: 7, tokenId: "ghost" };
    const mapState = { tokens: {}, fogs: {}, editFlags: [], mapId: "map-1" };
    expect(resolveInitiativeEntry(entry, mapState)).toBe(entry);
  });
});

/**
 * Pedido do usuário (2026-10-12, terceira rodada): monitor de tempo de
 * combate pela regra do PHB 2014 — 1 rodada completa ≈ 6 segundos.
 */
describe("combatElapsedSeconds", () => {
  test("is 0 while the first round is still in progress", () => {
    expect(combatElapsedSeconds({ tableId: "t", entries: [], round: 1 })).toBe(0);
  });

  test("is 0 for a null state or a state with no round field yet", () => {
    expect(combatElapsedSeconds(null)).toBe(0);
    expect(combatElapsedSeconds({ tableId: "t", entries: [] })).toBe(0);
  });

  test("counts only FULLY COMPLETED rounds, 6 seconds each", () => {
    expect(combatElapsedSeconds({ tableId: "t", entries: [], round: 2 })).toBe(6);
    expect(combatElapsedSeconds({ tableId: "t", entries: [], round: 5 })).toBe(24);
  });
});

describe("formatCombatTime", () => {
  test("formats whole minutes and seconds as m:ss", () => {
    expect(formatCombatTime(0)).toBe("0:00");
    expect(formatCombatTime(6)).toBe("0:06");
    expect(formatCombatTime(66)).toBe("1:06");
    expect(formatCombatTime(600)).toBe("10:00");
  });

  test("never goes negative", () => {
    expect(formatCombatTime(-30)).toBe("0:00");
  });
});

/**
 * Pedido do usuário (2026-10-12, quarta rodada): indicador de turno
 * ativo no token (Token.tsx) — resolve o tokenId a partir de
 * activeEntryId.
 */
describe("activeEntryTokenId", () => {
  test("resolves the tokenId of the active entry", () => {
    const state: InitiativeState = {
      tableId: "t",
      entries: [
        { id: "e1", name: "Goblin", initiative: 8, hp: 7, maxHp: 7, tokenId: "tok-a" },
        { id: "e2", name: "Fighter", initiative: 18, hp: 30, maxHp: 30, tokenId: "tok-b" },
      ],
      activeEntryId: "e2",
    };
    expect(activeEntryTokenId(state)).toBe("tok-b");
  });

  test("is undefined when nothing is active", () => {
    expect(
      activeEntryTokenId({ tableId: "t", entries: [] })
    ).toBeUndefined();
  });

  test("is undefined for a null state", () => {
    expect(activeEntryTokenId(null)).toBeUndefined();
  });

  test("is undefined when the active entry has no linked token (free-typed)", () => {
    const state: InitiativeState = {
      tableId: "t",
      entries: [{ id: "e1", name: "Fighter", initiative: 10, hp: 30, maxHp: 30 }],
      activeEntryId: "e1",
    };
    expect(activeEntryTokenId(state)).toBeUndefined();
  });
});
