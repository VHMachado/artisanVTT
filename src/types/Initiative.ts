/**
 * One row in the Mesa's initiative/HP tracker ("HP dos monstros
 * acompanhado no mesmo painel — juntar os dois foi a
 * intuição certa: a informação é consultada no mesmo momento"). Free-typed
 * by the GM rather than linked to a placed token or a synced
 * Character/TableMonster on purpose: not every combatant on the initiative
 * order has a token on the board yet (an ambush not revealed, a lurking
 * archer), and forcing a link would block adding it. HP is tracked here
 * independently of any token's own state — this is a session-scoped combat
 * tracker, not a second source of truth for map tokens.
 *
 * Pedido do usuário (2026-10-12): permitir adicionar tokens selecionados
 * no mapa diretamente ao combate, com o vínculo PERMANENTE — nome/HP do
 * tracker sempre espelham o token real, e remover o token do mapa remove
 * a entrada. `tokenId` é esse vínculo opcional: quando presente, a UI
 * (InitiativeTrackerModal) lê `name`/`hp`/`maxHp` do TokenState
 * (types/TokenState.ts) em vez dos campos abaixo, e uma edição de HP
 * escreve de volta no token via `onTokenStateChange`, não na entrada —
 * `name`/`hp`/`maxHp` abaixo continuam existindo como fallback (o que o
 * broker/armazenamento já espera encontrar) e como o único dado real para
 * uma entrada free-typed (tokenId ausente), que continua funcionando
 * exatamente como antes desta mudança. A limpeza de entradas cujo token
 * foi removido do mapa é feita por `withPrunedTokenEntries` (initiative.ts),
 * chamada pelo consumidor (MapDock.tsx) sempre que mapState.tokens muda.
 */
export type InitiativeEntry = {
  id: string;
  name: string;
  initiative: number;
  hp: number;
  maxHp: number;
  /** Id of the TokenState (types/TokenState.ts) this entry was added
   * from — undefined for a free-typed combatant with no token on the
   * board. See the type-level comment above for the sync contract. */
  tokenId?: string;
};

/**
 * The "initiative" versioned broker field
 * (broker-go/internal/game/hub.go's handleInitiative/handleInitiativeUpdate)
 * — the same full-replace-plus-diffed-partial-update discipline as
 * mapState/manifest: "Entra no map_state
 * versionado ou como campo próprio com a mesma disciplina de
 * versão." Keyed by tableId (not mapId), matching a dedicated field: the
 * tracker belongs to the Mesa's LIVE SESSION ("sincronizada por sessão"),
 * not to whichever map happens to be loaded — switching maps mid-combat
 * must not wipe or reset it.
 */
export type InitiativeState = {
  tableId: string;
  entries: InitiativeEntry[];
  /** Id of the entry whose turn it currently is — an id survives an
   * initiative edit reordering the list, an index into the sorted list
   * would not. Undefined means no active turn (combat hasn't started, or
   * was just cleared). */
  activeEntryId?: string;
  /**
   * Pedido do usuário (2026-10-12, terceira rodada): contador de
   * rodadas — "uma rodada passa quando o turno de todos já passou".
   * 1-indexed, undefined means round 1 (combat not yet advanced past
   * its first turn — same "missing field defaults to the natural
   * starting value" convention `activeEntryId` already uses). Bumped
   * by `withNextTurn` (helpers/initiative.ts) exactly when advancing
   * the turn wraps from the LAST combatant back to the first — see
   * that function's comment for why a bare "started combat" doesn't
   * also count as completing a round. Drives the combat-time monitor
   * (`combatElapsedSeconds`/`formatCombatTime`, same file) per the 5e
   * (2014) PHB rule that a round represents about 6 seconds of game
   * time.
   */
  round?: number;
};
