import { v4 as uuid } from "uuid";

import { InitiativeEntry, InitiativeState } from "../types/Initiative";
import { TokenState } from "../types/TokenState";
import { MapState } from "../types/MapState";

/**
 * Pure state-transition helpers for the initiative/HP tracker,
 * separated from useInitiativeTracker.ts (the React/networking wrapper)
 * so the actual combat-list logic is unit-testable with no hook rendering
 * — same split this repo already uses for tableMonsters.ts vs. the
 * components/hooks that call it.
 *
 * Pedido do usuário (2026-10-12): adicionar tokens do mapa (selecionados
 * com shift+click) diretamente ao combate, com vínculo PERMANENTE —
 * `withAddedTokenEntries`/`withPrunedTokenEntries` abaixo são a metade
 * "pura" dessa mudança (a metade "rede" fica em useInitiativeTracker.ts).
 */

export function emptyInitiativeState(tableId: string): InitiativeState {
  return { tableId, entries: [] };
}

/** Combat order: highest initiative first. Never mutates `state`. */
export function sortedInitiativeEntries(
  state: InitiativeState | null
): InitiativeEntry[] {
  return [...(state?.entries || [])].sort((a, b) => b.initiative - a.initiative);
}

export function withAddedEntry(
  state: InitiativeState | null,
  tableId: string,
  entry: Omit<InitiativeEntry, "id">
): InitiativeState {
  const base = state || emptyInitiativeState(tableId);
  return {
    ...base,
    tableId,
    entries: [...base.entries, { ...entry, id: uuid() }],
  };
}

export function withUpdatedEntry(
  state: InitiativeState | null,
  tableId: string,
  id: string,
  patch: Partial<Omit<InitiativeEntry, "id">>
): InitiativeState {
  const base = state || emptyInitiativeState(tableId);
  return {
    ...base,
    tableId,
    entries: base.entries.map((entry) =>
      entry.id === id ? { ...entry, ...patch } : entry
    ),
  };
}

export function withRemovedEntry(
  state: InitiativeState | null,
  tableId: string,
  id: string
): InitiativeState {
  const base = state || emptyInitiativeState(tableId);
  return {
    ...base,
    tableId,
    entries: base.entries.filter((entry) => entry.id !== id),
    // Removing the active combatant clears the highlight rather than
    // leaving activeEntryId pointing at an entry that no longer exists.
    activeEntryId:
      base.activeEntryId === id ? undefined : base.activeEntryId,
  };
}

/**
 * Advances the active turn to the next entry in initiative order (sorted,
 * not insertion order), wrapping back to the top after the last one. If
 * nothing is active yet (combat just started, or the previous active
 * entry was removed), starts at the top of the order. No-ops (clears
 * activeEntryId) when the list is empty.
 *
 * Pedido do usuário (2026-10-12, terceira rodada): "uma rodada passa
 * quando o turno de todos já passou" — `round` only increments when
 * this call wraps from the LAST combatant back to the FIRST. Starting
 * combat (currentIndex === -1, nobody's had a turn yet) does NOT count
 * as completing a round, even though it also lands on index 0 — that
 * would make round 2 start before anyone had taken round 1's first
 * turn. A single-combatant order (sorted.length === 1) still advances
 * a round every "next turn" click, which matches the rule: that one
 * combatant's turn passing IS everyone's turn passing.
 */
export function withNextTurn(
  state: InitiativeState | null,
  tableId: string
): InitiativeState {
  const base = state || emptyInitiativeState(tableId);
  const sorted = sortedInitiativeEntries(base);
  if (sorted.length === 0) {
    return { ...base, tableId, activeEntryId: undefined };
  }
  const currentIndex = sorted.findIndex(
    (entry) => entry.id === base.activeEntryId
  );
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % sorted.length;
  const wrapped = currentIndex !== -1 && nextIndex === 0;
  return {
    ...base,
    tableId,
    activeEntryId: sorted[nextIndex].id,
    round: wrapped ? (base.round ?? 1) + 1 : base.round ?? 1,
  };
}

export function withClearedInitiative(tableId: string): InitiativeState {
  return emptyInitiativeState(tableId);
}

/** Seed values for a new entry built from a placed token — see the
 * type-level comment on InitiativeEntry.tokenId for the sync contract
 * (name/hp are a snapshot only; the UI resolves the LIVE token for
 * display, these just need to be valid numbers/strings at creation). */
export function entryFromToken(
  tokenState: TokenState
): Omit<InitiativeEntry, "id"> {
  return {
    name: tokenState.label || "Token",
    initiative: 0,
    hp: tokenState.hp?.current ?? 0,
    maxHp: tokenState.hp?.max ?? 0,
    tokenId: tokenState.id,
  };
}

/**
 * Adds one entry per token in `tokenStates`, skipping any token that
 * already has a linked entry (shift+clicking "Adicionar ao combate"
 * twice on the same selection must not duplicate it). Returns the SAME
 * `state` reference (or an equivalent empty one) when every token was
 * already linked, so a caller can skip syncing a no-op update.
 */
export function withAddedTokenEntries(
  state: InitiativeState | null,
  tableId: string,
  tokenStates: TokenState[]
): InitiativeState {
  const base = state || emptyInitiativeState(tableId);
  const alreadyLinked = new Set(
    base.entries.filter((entry) => entry.tokenId).map((entry) => entry.tokenId)
  );
  const newEntries = tokenStates
    .filter((token) => !alreadyLinked.has(token.id))
    .map((token) => ({ ...entryFromToken(token), id: uuid() }));
  if (newEntries.length === 0) {
    return base;
  }
  return {
    ...base,
    tableId,
    entries: [...base.entries, ...newEntries],
  };
}

/**
 * Drops every entry whose `tokenId` no longer exists in `existingTokenIds`
 * — called whenever mapState.tokens changes, so deleting a token from the
 * map also removes it from the combat (the permanent-link contract the
 * user asked for). A free-typed entry (no tokenId) is never touched.
 * Returns the SAME reference when nothing was stale, so the caller
 * (useInitiativeTracker.ts) can skip emitting a no-op network update on
 * every unrelated mapState tick.
 */
export function withPrunedTokenEntries(
  state: InitiativeState | null,
  tableId: string,
  existingTokenIds: Set<string>
): InitiativeState {
  const base = state || emptyInitiativeState(tableId);
  const staleIds = new Set(
    base.entries
      .filter((entry) => entry.tokenId && !existingTokenIds.has(entry.tokenId))
      .map((entry) => entry.id)
  );
  if (staleIds.size === 0) {
    return base;
  }
  return {
    ...base,
    tableId,
    entries: base.entries.filter((entry) => !staleIds.has(entry.id)),
    activeEntryId:
      base.activeEntryId && staleIds.has(base.activeEntryId)
        ? undefined
        : base.activeEntryId,
  };
}

/**
 * Resolves the DISPLAYED name/hp/maxHp for one entry — the permanent-link
 * contract the user asked for: a linked entry (`tokenId` set) always
 * shows the LIVE token's own label/hp, not whatever was snapshotted when
 * it was added, so a GM renaming a token or changing its HP (in
 * TokenMenu.tsx or anywhere else) is reflected in the tracker without an
 * extra write to the entry itself. A free-typed entry (no tokenId, or
 * its token no longer on the map — pruning hasn't run yet/failed to sync)
 * falls back to its own stored fields, unchanged from before this
 * feature existed.
 */
export function resolveInitiativeEntry(
  entry: InitiativeEntry,
  mapState: MapState | null
): InitiativeEntry {
  const token = entry.tokenId ? mapState?.tokens[entry.tokenId] : undefined;
  if (!token) {
    return entry;
  }
  return {
    ...entry,
    name: token.label || entry.name,
    hp: token.hp?.current ?? entry.hp,
    maxHp: token.hp?.max ?? entry.maxHp,
  };
}

/**
 * Pedido do usuário (2026-10-12, terceira rodada): monitor de tempo do
 * combate "de acordo com as regras de passagem de tempo durante o
 * combate do D&D 5e 2014" — a única regra o PHB (2014) dá para isso é
 * "A round represents about 6 seconds in the game world" (cap. 9,
 * "The Order of Combat"): não há granularidade por turno individual,
 * só por RODADA completa. `state.round` (helpers/initiative.ts's
 * `withNextTurn`) já conta rodadas completas (1-indexed, "rodada 1" é
 * a primeira em andamento) — tempo decorrido é só o número de rodadas
 * JÁ FECHADAS (`round - 1`) vezes 6 segundos; a rodada em andamento
 * ainda não terminou, então não entra na soma.
 */
export const COMBAT_ROUND_SECONDS = 6;

export function combatElapsedSeconds(state: InitiativeState | null): number {
  const round = state?.round ?? 1;
  return Math.max(0, round - 1) * COMBAT_ROUND_SECONDS;
}

/** "m:ss" for the dock's compact display — totalSeconds is always a
 * non-negative multiple of COMBAT_ROUND_SECONDS from the function
 * above, but this doesn't assume that (defensive against a future
 * caller passing an arbitrary duration). */
export function formatCombatTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Pedido do usuário (2026-10-12, quarta rodada): indicador visual no
 * TOKEN de quem está no turno agora (Token.tsx's `isActiveTurn`), "no
 * estilo do indicador de seleção" — ver Token.tsx's comentário na borda
 * de seleção. Resolve o `tokenId` da entrada ativa (`state.activeEntryId`)
 * para o mapa poder comparar `tokenState.id` diretamente; undefined tanto
 * para "sem turno ativo" quanto para uma entrada ativa free-typed (sem
 * token no mapa) — nenhum dos dois casos tem token para destacar.
 */
export function activeEntryTokenId(
  state: InitiativeState | null
): string | undefined {
  if (!state?.activeEntryId) {
    return undefined;
  }
  return state.entries.find((entry) => entry.id === state.activeEntryId)
    ?.tokenId;
}
