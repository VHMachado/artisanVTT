import { useCallback } from "react";

import useNetworkedState, {
  SetNetworkedState,
} from "./useNetworkedState";
import Session from "../network/Session";

import {
  emptyInitiativeState,
  withAddedEntry,
  withAddedTokenEntries,
  withClearedInitiative,
  withNextTurn,
  withPrunedTokenEntries,
  withRemovedEntry,
  withUpdatedEntry,
} from "../helpers/initiative";

import { InitiativeEntry, InitiativeState } from "../types/Initiative";
import { TokenState } from "../types/TokenState";

/**
 * The initiative/HP tracker, synced through the broker's dedicated
 * "initiative" versioned field (broker-go/internal/game/hub.go) — same
 * broker-authoritative version-guard discipline as mapState/manifest (see useNetworkedState's
 * `versioned` flag), keyed by tableId rather than mapId so switching maps
 * mid-combat doesn't reset it.
 *
 * Only the Mestre may WRITE (the user decided the tracker itself is
 * Mestre-only, not shown to Jogadores at all — see RightPanel/MapControls'
 * `isGM` gate for the equivalent pattern this hook's caller applies before
 * ever rendering the button that opens this). This hook itself doesn't
 * enforce that — its caller is expected to be mounted/rendered only for
 * the GM, same as every other Mestre-only feature in this codebase
 * (RightPanel, the monster context menu). The broker's own
 * handleInitiative/handleInitiativeUpdate apply no server-side
 * authorization (see hub.go's comment on that) because a Jogador who
 * never opens the tracker UI never sends an initiative/initiative_update
 * frame in the first place — same trust level as `manifest`.
 */
function useInitiativeTracker(session: Session, tableId: string) {
  const [state, setState] = useNetworkedState<InitiativeState | null>(
    null,
    session,
    "initiative",
    300,
    true,
    "tableId",
    true // Broker-authoritative version guard, see useNetworkedState.ts
  );

  /**
   * Pedido do usuário (2026-10-12, quinta rodada): corrige o combate não
   * persistir ao sair/voltar da mesa, com só a PRIMEIRA entrada
   * sobrevivendo — causa raiz era uma corrida entre o debounce de
   * useNetworkedState (300ms) e o round-trip do ack de versão:
   * sem `force`, cada mutação depois da primeira tenta um UPDATE PARCIAL
   * carimbado com `versionRef.current`, que só é atualizado quando o ack
   * da mutação ANTERIOR chega. Duas mutações (ex.: "Adicionar ao
   * combate" para dois grupos de criaturas) em menos de um round-trip
   * fazem a segunda carregar um `baseVersion` já desatualizado — o
   * broker (`ApplyVersionedUpdate` em repository.go) rejeita por
   * conflito de versão e devolve o estado CANÔNICO (ainda só com a
   * primeira entrada), que `useNetworkedState`'s `handleSocketEvent`
   * aplica de volta por cima do estado local, apagando silenciosamente
   * a segunda entrada sem nenhum erro visível.
   *
   * `force: true` faz TODA mutação do tracker ir pelo caminho de
   * substituição INTEGRAL (`session.socket.emit("initiative", ...)`),
   * que o broker aplica com `SetVersionedState` — a mesma via
   * incondicional (sem checar baseVersion) que mapState/manifest já
   * usam para seu próprio full-replace. Isto elimina a corrida por
   * completo: não há mais nenhum caminho de update parcial dependente
   * de um ack ainda em voo. O tracker é pequeno (um punhado de
   * combatentes), então o custo de sempre mandar o estado inteiro é
   * desprezível — e o comentário original do useNetworkedState já
   * descartava qualquer merge fino mesmo no caminho parcial, então não
   * se perde nenhuma capacidade real ao abandoná-lo aqui.
   */
  const mutate = useCallback(
    (updater: (prev: InitiativeState | null) => InitiativeState) => {
      (setState as SetNetworkedState<InitiativeState | null>)(
        updater,
        true,
        true
      );
    },
    [setState]
  );

  const addEntry = useCallback(
    (entry: Omit<InitiativeEntry, "id">) => {
      mutate((prev) => withAddedEntry(prev, tableId, entry));
    },
    [mutate, tableId]
  );

  const updateEntry = useCallback(
    (id: string, patch: Partial<Omit<InitiativeEntry, "id">>) => {
      mutate((prev) => withUpdatedEntry(prev, tableId, id, patch));
    },
    [mutate, tableId]
  );

  const removeEntry = useCallback(
    (id: string) => {
      mutate((prev) => withRemovedEntry(prev, tableId, id));
    },
    [mutate, tableId]
  );

  /**
   * Pedido do usuário (2026-10-12): "Adicionar selecionados ao combate" —
   * um combatente por token, pulando qualquer token já vinculado a uma
   * entrada existente (ver withAddedTokenEntries). Lê o estado atual
   * diretamente (não via `mutate`'s updater) para decidir, ANTES de
   * tocar a rede, se há algo de fato a adicionar — chamar `mutate`
   * incondicionalmente marcaria a sessão como "dirty" e emitiria um
   * update vazio mesmo quando toda a seleção já estava no combate.
   */
  const addTokenEntries = useCallback(
    (tokenStates: TokenState[]) => {
      if (tokenStates.length === 0) {
        return;
      }
      const next = withAddedTokenEntries(state, tableId, tokenStates);
      if (next !== state) {
        mutate(() => next);
      }
    },
    [mutate, tableId, state]
  );

  /**
   * Called by the Mesa's token-removal path whenever mapState.tokens
   * changes, so a token deleted from the board also drops its linked
   * combat entry (the permanent-link contract — see
   * types/Initiative.ts's tokenId comment). Same early-exit discipline
   * as addTokenEntries above: a no-op prune must not touch the network.
   */
  const pruneStaleTokenEntries = useCallback(
    (existingTokenIds: Set<string>) => {
      if (!state) {
        return;
      }
      const next = withPrunedTokenEntries(state, tableId, existingTokenIds);
      if (next !== state) {
        mutate(() => next);
      }
    },
    [mutate, tableId, state]
  );

  const nextTurn = useCallback(() => {
    mutate((prev) => withNextTurn(prev, tableId));
  }, [mutate, tableId]);

  const clear = useCallback(() => {
    mutate(() => withClearedInitiative(tableId));
  }, [mutate, tableId]);

  return {
    state: state ?? emptyInitiativeState(tableId),
    addEntry,
    updateEntry,
    removeEntry,
    addTokenEntries,
    pruneStaleTokenEntries,
    nextTurn,
    clear,
  };
}

export default useInitiativeTracker;
