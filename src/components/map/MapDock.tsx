import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Flex, IconButton } from "theme-ui";

import Popover from "../Popover";

import SettingsIcon from "../../icons/SettingsIcon";
import InitiativeTrackerIcon from "../../icons/InitiativeTrackerIcon";
import D20Icon from "../../icons/D20Icon";
import CloseIcon from "../../icons/CloseIcon";
import DiceThrowIcon from "../../icons/DiceThrowIcon";

import SettingsModal from "../../modals/SettingsModal";
import InitiativeTrackerModal from "../party/InitiativeTrackerModal";
import DiceSelectPanel, {
  MAX_PER_TYPE,
  totalPending,
  describePending,
} from "../dice/DiceSelectPanel";
import type { PendingDiceCounts } from "../dice/DiceSelectPanel";
import DiceRollResultCard from "../dice/DiceRollResultCard";

import {
  DiceLoadingProvider,
  useDiceLoading,
} from "../../contexts/DiceLoadingContext";
import { usePlayerUpdater } from "../../contexts/PlayerContext";
import { useAccount } from "../../contexts/AccountContext";
import { useIsSpectator } from "../../contexts/SpectatorContext";
import { useKeyboard } from "../../contexts/KeyboardContext";
import { useUserId } from "../../contexts/UserIdContext";

import useSetting from "../../hooks/useSetting";
import { useTable } from "../../hooks/useTable";
import useInitiativeTracker from "../../hooks/useInitiativeTracker";
import useSharedDiceRolls from "../../hooks/useSharedDiceRolls";

import { floatingButtonSx } from "../../helpers/floatingButtonSx";
import { suggestedMaxHpForToken } from "../../helpers/initiativeRoll";
import {
  MAX_DICE_TOTAL,
  newRollSeed,
  type DiceRollRequest,
  type SharedDiceRollPayload,
} from "../../helpers/diceRoll";
import {
  clearDiceRollQueue,
  completeDiceRoll,
  emptyDiceRollQueue,
  enqueueDiceRoll,
} from "../../helpers/diceRollQueue";

import Session from "../../network/Session";
import type { DiceRoll, DiceType } from "../../types/Dice";
import type { MapState } from "../../types/MapState";
import type { TokenStateChangeEventHandler } from "../../types/Events";

const DiceRollLayer = React.lazy(() => import("../dice/DiceRollLayer"));

/**
 * Os dois botões laterais do dock. Ambos maiores que um `IconButton` solto
 * (ajuste pedido depois da primeira rodada de iteração do dock: no tamanho
 * padrão de 32px eles ficaram pequenos para um controle permanente de
 * sessão), e iguais entre si — a hierarquia do dock é marcada só pelo
 * botão central, que é maior ainda.
 *
 * Reduzidos de 44px para 38px (pedido do usuário) — ainda bem
 * maiores que o padrão de 32px do theme-ui, só um pouco menos dominantes
 * ao lado do botão central.
 *
 * `floatingButtonSx` (vidro fosco) é compartilhado com o rail da direita
 * (`MapControls.tsx`'s `railButtonSx`) — mesma linguagem visual, pedido
 * do usuário, para os dois conjuntos de botões circulares flutuantes.
 */
const sideButtonSx = {
  ...floatingButtonSx(38, 22),
  pointerEvents: "all" as const,
};

/** Return type of `useInitiativeTracker` — pulled up to `Map.tsx` (Fase
 * 16d's parent) so the active-turn token highlight (Token.tsx's
 * `isActiveTurn`) is available to EVERY client (GM, Jogador, Espectador),
 * not only the GM window that renders this dock's tracker UI. See
 * Map.tsx's own comment where the hook is now called. */
type InitiativeTracker = ReturnType<typeof useInitiativeTracker>;

type MapDockProps = {
  /** The Mesa being played — decides GM-only content and feeds the
   * tracker's own broker channel. */
  tableId: string;
  session: Session;
  /**
   * Pedido do usuário (2026-10-12): "Adicionar selecionados ao combate"
   * — mapState para resolver os TokenState selecionados e para o
   * auto-prune de entradas cujo token saiu do mapa (ver
   * useInitiativeTracker.ts's pruneStaleTokenEntries); undefined antes
   * do mapa carregar, igual a Map.tsx já trata em outros pontos.
   */
  mapState: MapState | null;
  /** Ids de tokens atualmente selecionados no mapa (marquee OU
   * shift+click — qualquer seleção), para oferecer "Adicionar
   * selecionados ao combate" no botão de iniciativa. */
  selectedTokenIds: string[];
  /** Para o tracker escrever HP de volta no TOKEN (vínculo permanente —
   * ver types/Initiative.ts's tokenId) quando o GM edita HP de uma
   * entrada vinculada. */
  onMapTokenStateChange: TokenStateChangeEventHandler;
  /**
   * Pedido do usuário (2026-10-12, quarta rodada, item 6): limpa a
   * seleção da grid depois de "Adicionar selecionados ao combate" — a
   * seleção por shift+click (useMapSelection.tsx's `clearSelection`),
   * repassada por Map.tsx.
   */
  onClearSelection: () => void;
  /**
   * Pedido do usuário (2026-10-12, quarta rodada, item 5): o tracker
   * agora é instanciado em Map.tsx (não mais aqui) — ver o comentário
   * em `InitiativeTracker` acima — para o indicador de turno ativo no
   * token (Token.tsx's `isActiveTurn`) alcançar TODOS os clientes, não
   * só o Mestre. Repassado como já-pronto em vez de reconstruído aqui.
   */
  tracker: InitiativeTracker;
};

/**
 * Os três botões inferiores da tela de jogo —
 * configurações, dados e iniciativa — mais a camada de dados sobre a grid.
 *
 * O provider fica no topo porque o painel precisa saber se as malhas ainda
 * carregam e a camada é quem incrementa/decrementa essa contagem.
 */
function MapDock(props: MapDockProps) {
  const isSpectator = useIsSpectator();

  return (
    <DiceLoadingProvider>
      {isSpectator ? (
        <SpectatorDiceLayer session={props.session} />
      ) : (
        <MapDockContent {...props} />
      )}
    </DiceLoadingProvider>
  );
}

/**
 * A janela Espectador é somente leitura: não exibe dock, configurações ou
 * tracker, mas ainda precisa montar a camada Babylon quando uma rolagem
 * compartilhada chega. Antes ela retornava `null` em `MapDock`, portanto até
 * recebia o evento no broker, mas não havia nenhum listener/canvas para
 * animá-lo. Mantemos uma fila igual à da mesa normal: rajadas de eventos não
 * podem trocar as malhas no meio da física de uma rolagem já ativa.
 */
function SpectatorDiceLayer({ session }: Pick<MapDockProps, "session">) {
  const sharedRequest = useSharedDiceRolls(session);
  const [rollQueue, setRollQueue] = useState(emptyDiceRollQueue);
  const rollQueueRef = useRef(rollQueue);
  const [hasMountedDiceLayer, setHasMountedDiceLayer] = useState(false);
  const diceLayerFailedRef = useRef(false);

  const enqueueSharedRequest = useCallback((next: SharedDiceRollPayload) => {
    // Sem uma ação local na janela spectator para pedir nova tentativa, uma
    // falha de WebGL/Ammo não deve disparar uma sequência de remounts por
    // cada evento recebido.
    if (diceLayerFailedRef.current) {
      return;
    }
    const updated = enqueueDiceRoll(rollQueueRef.current, {
      ...next,
      publishResults: false,
    });
    if (updated === rollQueueRef.current) {
      return;
    }
    rollQueueRef.current = updated;
    setRollQueue(updated);
    setHasMountedDiceLayer(true);
  }, []);

  useEffect(() => {
    if (sharedRequest) {
      enqueueSharedRequest(sharedRequest);
    }
  }, [sharedRequest, enqueueSharedRequest]);

  const handleRollComplete = useCallback((completed: DiceRollRequest) => {
    const updated = completeDiceRoll(rollQueueRef.current, completed);
    if (updated !== rollQueueRef.current) {
      rollQueueRef.current = updated;
      setRollQueue(updated);
    }
  }, []);

  const handleDiceLayerError = useCallback(() => {
    diceLayerFailedRef.current = true;
    const cleared = clearDiceRollQueue(rollQueueRef.current);
    rollQueueRef.current = cleared;
    setRollQueue(cleared);
  }, []);

  const ignoreDiceRollsChange = useCallback((_rolls: DiceRoll[]) => {}, []);

  if (!hasMountedDiceLayer) {
    return null;
  }

  return (
    <React.Suspense fallback={null}>
      <DiceRollLayer
        request={rollQueue.active}
        onDiceRollsChange={ignoreDiceRollsChange}
        onRollComplete={handleRollComplete}
        onLoadError={handleDiceLayerError}
        clearToken={0}
      />
    </React.Suspense>
  );
}

function MapDockContent({
  tableId,
  session,
  mapState,
  selectedTokenIds,
  onMapTokenStateChange,
  onClearSelection,
  tracker,
}: MapDockProps) {
  const userId = useUserId();
  const setPlayerState = usePlayerUpdater();
  const { session: accountSession } = useAccount();
  const table = useTable(tableId);
  const [shareDice, setShareDice] = useSetting<boolean>("dice.shareDice");
  const { isLoading } = useDiceLoading();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const trackerButtonRef = useRef<HTMLButtonElement>(null);
  const [counts, setCounts] = useState<PendingDiceCounts>({});
  const [rollQueue, setRollQueue] = useState(emptyDiceRollQueue);
  const rollQueueRef = useRef(rollQueue);
  const [hasMountedDiceLayer, setHasMountedDiceLayer] = useState(false);
  const diceLayerFailedRef = useRef(false);
  const [diceLayerGeneration, setDiceLayerGeneration] = useState(0);
  const request = rollQueue.active;
  // A última rolagem LOCAL (nunca uma recebida de outro jogador —
  // handleDiceRollsChange só é chamado para publishResults:true, ver
  // DiceRollLayer), para o cartão de resultado "ROLL / ... / DICE ROLL"
  // que aparece depois de rolar. Nulo até a primeira rolagem desta sessão;
  // "Limpar" no próprio cartão zera de volta, sem desfazer nada na cena —
  // os dados continuam parados sobre a grid até a PRÓXIMA rolagem.
  const [lastRollResult, setLastRollResult] = useState<DiceRoll[] | null>(
    null
  );
  // Sobe a cada "Limpar" e também ao abrir a bandeja de seleção —
  // o usuário reportou os dois casos como não limpando os dados antigos da
  // tela. Ver o comentário em `DiceRollLayer`'s `clearToken` prop.
  const [clearToken, setClearToken] = useState(0);

  // The tracker is Mestre-only — Jogadores neither edit
  // NOR see it. The Espectador gate is already handled by MapDock above.
  const isOwner = Boolean(
    accountSession && table && table.ownerId === accountSession.accountId
  );

  // Hooks run unconditionally so their subscription order never changes.
  const sharedRequest = useSharedDiceRolls(session);

  // Pedido do usuário (2026-10-12): remover do combate a entrada de
  // qualquer token que não existe mais no mapa (vínculo PERMANENTE —
  // ver types/Initiative.ts's tokenId). Roda a cada mudança de
  // mapState.tokens; pruneStaleTokenEntries é um no-op (não toca a
  // rede) quando nada está obsoleto, então isto é seguro em todo
  // render/mapa que não tem nenhuma entrada vinculada.
  useEffect(() => {
    if (!isOwner || !mapState) {
      return;
    }
    tracker.pruneStaleTokenEntries(new Set(Object.keys(mapState.tokens)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, mapState?.tokens]);

  /**
   * "Adicionar selecionados ao combate" (pedido do usuário, 2026-10-12;
   * ajustado 2026-10-12 segunda rodada: "Somente personagens podem ser
   * adicionados"): um combatente por token de CRIATURA selecionado —
   * `category === "character"` cobre Personagens, monstros e NPCs (ver
   * helpers/characterToken.ts/monsterToken.ts, ambos usam essa mesma
   * categoria), filtrando props e veículos, que não fazem sentido num
   * combate. Compartilhada pelo botão (contagem exibida) e pelo clique
   * (o que de fato é adicionado) para os dois nunca discordarem.
   */
  const selectableTokenStates = mapState
    ? selectedTokenIds
        .map((id) => mapState.tokens[id])
        .filter((token): token is NonNullable<typeof token> => Boolean(token))
        .filter((token) => token.category === "character")
    : [];

  function handleAddSelectedToCombat() {
    tracker.addTokenEntries(selectableTokenStates);
    // Pedido do usuário (2026-10-12, quarta rodada, item 6): limpa a
    // seleção da grid depois de adicionar ao combate — o fluxo comum é
    // selecionar tokens, mandar pro tracker, e começar a trabalhar com
    // eles de novo sem a seleção múltipla anterior em cima.
    onClearSelection();
    // Pedido do usuário (2026-10-12, segunda rodada): "HP máximo deve
    // ser puxado direto da ficha" — um valor INICIAL sugerido (ver
    // helpers/initiativeRoll.ts's suggestedMaxHpForToken), não travado:
    // só preenche tokens que ainda não têm `hp` nenhum, nunca
    // sobrescreve um HP que o GM já ajustou manualmente. Roda depois
    // de addTokenEntries (síncrono) para a entrada já aparecer no
    // tracker enquanto a ficha/bestiário carrega — resolveInitiativeEntry
    // relê o token ao vivo, então o HP "aparece" assim que a escrita
    // chega, sem a entrada precisar remontar.
    for (const token of selectableTokenStates) {
      if (token.hp) {
        continue;
      }
      suggestedMaxHpForToken(token).then((maxHp) => {
        if (maxHp === undefined) {
          return;
        }
        onMapTokenStateChange({
          [token.id]: {
            hp: { current: maxHp, max: maxHp },
            lastModifiedBy: userId,
            lastModified: Date.now(),
          },
        });
      });
    }
  }

  /**
   * Uma única cena de física atende rolagens locais e remotas. Serializar é
   * necessário: se uma rolagem remota limpasse as meshes no meio da local,
   * o resultado local poderia ficar eternamente "unknown". A próxima só
   * começa quando DiceRollLayer avisa que todos os dados adormeceram.
   */
  const enqueueRequest = useCallback(
    (next: DiceRollRequest) => {
      // Uma cena que falhou só é recriada por ação local. Eventos remotos
      // durante a falha são descartados para não transformar uma rajada de
      // rede numa sequência de tentativas caras de WebGL/Ammo.
      if (diceLayerFailedRef.current && !next.publishResults) {
        return false;
      }
      if (diceLayerFailedRef.current) {
        diceLayerFailedRef.current = false;
        setDiceLayerGeneration((generation) => generation + 1);
      }
      const updated = enqueueDiceRoll(rollQueueRef.current, next);
      if (updated === rollQueueRef.current) {
        return false;
      }
      setHasMountedDiceLayer(true);
      rollQueueRef.current = updated;
      setRollQueue(updated);
      return true;
    },
    []
  );

  useEffect(() => {
    if (sharedRequest) {
      enqueueRequest({ ...sharedRequest, publishResults: false });
    }
  }, [sharedRequest, enqueueRequest]);

  const handleRollComplete = useCallback((completed: DiceRollRequest) => {
    // Um callback atrasado de uma rolagem substituída nunca pode consumir a
    // fila da rolagem que está na tela agora.
    const updated = completeDiceRoll(rollQueueRef.current, completed);
    if (updated !== rollQueueRef.current) {
      rollQueueRef.current = updated;
      setRollQueue(updated);
    }
  }, []);

  const handleDiceLayerError = useCallback(() => {
    diceLayerFailedRef.current = true;
    const cleared = clearDiceRollQueue(rollQueueRef.current);
    rollQueueRef.current = cleared;
    setRollQueue(cleared);
  }, []);

  const handleDiceRollsChange = useCallback(
    (rolls: DiceRoll[]) => {
      setPlayerState(
        (prevState) => ({
          ...prevState,
          dice: { share: shareDice, rolls },
        }),
        shareDice
      );
      // Só chega aqui para a rolagem LOCAL (publishResults:true) — ver
      // DiceRollLayer. É o gatilho do cartão de resultado.
      setLastRollResult(rolls);
    },
    [setPlayerState, shareDice]
  );

  const handleClearRollResult = useCallback(() => {
    setLastRollResult(null);
    setClearToken((token) => token + 1);
  }, []);

  const handleShareDiceChange = useCallback(
    (nextShareDice: boolean) => {
      setShareDice(nextShareDice);
      setPlayerState((prevState) => ({
        ...prevState,
        dice: { ...prevState.dice, share: nextShareDice },
      }));
    },
    [setPlayerState, setShareDice]
  );


  function addDie(type: DiceType) {
    setCounts((prev) => {
      if (totalPending(prev) >= MAX_DICE_TOTAL) {
        return prev;
      }
      return {
        ...prev,
        [type]: Math.min(MAX_PER_TYPE, (prev[type] || 0) + 1),
      };
    });
  }

  function removeDie(type: DiceType) {
    setCounts((prev) => {
      const next = Math.max(0, (prev[type] || 0) - 1);
      const updated = { ...prev };
      if (next === 0) {
        delete updated[type];
      } else {
        updated[type] = next;
      }
      return updated;
    });
  }

  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
    setCounts({});
  }, []);

  function handleRoll() {
    if (totalPending(counts) === 0) {
      return;
    }

    const payload: SharedDiceRollPayload = {
      // Copiar impede que uma futura edição do painel altere uma rolagem já
      // enfileirada por referência.
      counts: { ...counts },
      seed: newRollSeed(),
    };
    if (!enqueueRequest({ ...payload, publishResults: true })) {
      return;
    }

    if (shareDice) {
      // Volátil, como player_pointer: é um evento do momento, não estado a
      // reconciliar — quem conectar depois não deve ver dados de uma
      // rolagem já concluída.
      session.socket?.volatile.emit("dice_roll", payload);
    }
    closePanel();
  }

  const pendingTotal = totalPending(counts);

  /**
   * O botão central do dock assume três papéis em vez de abrir
   * sempre o mesmo D20 — pedido explícito do usuário a partir da
   * referência visual (a seta vermelha de arremesso e o "X" de fechar).
   * - Fechado: D20, abre o painel.
   * - Painel aberto, nenhum dado selecionado: "X", fecha o painel
   *   (equivalente a Cancelar, que o painel não tem mais botão próprio).
   * - Painel aberto, com dados selecionados: seta para cima, arremessa —
   *   equivalente ao antigo botão "Rolar" do painel.
   * ESC continua fechando o painel em qualquer estado (handleKeyDown).
   */
  function handleCentralButtonClick() {
    if (!isPanelOpen) {
      setIsPanelOpen(true);
      // Abrir a bandeja também limpa os dados da rolagem
      // anterior que ainda estão parados sobre a grid — o usuário reportou
      // que clicar no botão de dado não limpava nada, deixando o resultado
      // antigo visível enquanto uma nova seleção era montada.
      setLastRollResult(null);
      setClearToken((token) => token + 1);
      return;
    }
    if (pendingTotal === 0) {
      closePanel();
      return;
    }
    handleRoll();
  }

  const centralButtonLabel = !isPanelOpen
    ? "Dados"
    : pendingTotal === 0
    ? "Fechar dados"
    : `Rolar ${describePending(counts)}`;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && isPanelOpen) {
        closePanel();
      }
    },
    [closePanel, isPanelOpen]
  );
  useKeyboard(handleKeyDown);

  return (
    <>
      {/* Monta só depois da primeira rolagem: uma sessão que nunca usa dados
          não paga Babylon + Ammo + malhas. Depois permanece montada para a
          segunda rolagem não recarregar tudo. */}
      {hasMountedDiceLayer && (
        <React.Suspense fallback={null}>
          <DiceRollLayer
            key={diceLayerGeneration}
            request={request}
            onDiceRollsChange={handleDiceRollsChange}
            onRollComplete={handleRollComplete}
            onLoadError={handleDiceLayerError}
            clearToken={clearToken}
          />
        </React.Suspense>
      )}

      <Flex
        sx={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          alignItems: "center",
          gap: "14px",
          zIndex: 2,
          pointerEvents: "none",
        }}
        p={2}
      >
        <IconButton
          ref={settingsButtonRef}
          aria-label="Configurações"
          title="Configurações"
          onClick={() => setIsSettingsOpen((open) => !open)}
          sx={sideButtonSx}
        >
          <SettingsIcon />
        </IconButton>

        <Box
          sx={{
            position: "relative",
            width: "60px",
            height: "60px",
            flex: "0 0 60px",
            pointerEvents: "all",
          }}
        >
          {isPanelOpen && (
            <Box
              sx={{
                position: "absolute",
                bottom: "calc(100% + 12px)",
                left: "50%",
                transform: "translateX(-50%)",
              }}
            >
              <DiceSelectPanel
                counts={counts}
                onAdd={addDie}
                onRemove={removeDie}
                shareDice={shareDice}
                onShareDiceChange={handleShareDiceChange}
                loading={isLoading}
              />
            </Box>
          )}
          {/* Cartão de resultado da última rolagem LOCAL — só
              quando o painel de seleção está fechado, para não disputar o
              mesmo espaço acima do dock. Abrir o painel de novo (para uma
              nova rolagem) basta para tirá-lo da frente; ele só some de
              vez com "Limpar" ou substituindo por uma rolagem nova. */}
          {!isPanelOpen && lastRollResult && (
            <Box
              sx={{
                position: "absolute",
                bottom: "calc(100% + 12px)",
                left: "50%",
                transform: "translateX(-50%)",
              }}
            >
              <DiceRollResultCard
                rolls={lastRollResult}
                onClear={handleClearRollResult}
              />
            </Box>
          )}
          <IconButton
            aria-label={centralButtonLabel}
            title={centralButtonLabel}
            onClick={handleCentralButtonClick}
            sx={{
              ...floatingButtonSx(60, 34),
              // A seta de arremesso usa `danger` (vermelho) como
              // a referência visual pede — o único lugar do dock onde essa
              // cor aparece, já que ela só existe quando há algo pronto
              // para rolar (sinaliza a ação primária do momento, não um
              // estado de erro).
              color:
                isPanelOpen && pendingTotal > 0
                  ? "danger"
                  : isPanelOpen
                  ? "primary"
                  : "text",
            }}
          >
            {!isPanelOpen ? (
              <D20Icon />
            ) : pendingTotal === 0 ? (
              <CloseIcon />
            ) : (
              <DiceThrowIcon />
            )}
          </IconButton>
        </Box>

        {isOwner && (
          <IconButton
            ref={trackerButtonRef}
            aria-label="Iniciativa"
            title="Iniciativa"
            onClick={() => setIsTrackerOpen((open) => !open)}
            sx={sideButtonSx}
          >
            <InitiativeTrackerIcon />
          </IconButton>
        )}
      </Flex>

      {isSettingsOpen && (
        <Popover anchorRef={settingsButtonRef} onRequestClose={() => setIsSettingsOpen(false)} side="top">
          <SettingsModal />
        </Popover>
      )}
      {isOwner && isTrackerOpen && (
        <Popover anchorRef={trackerButtonRef} onRequestClose={() => setIsTrackerOpen(false)} side="top">
          <InitiativeTrackerModal
            state={tracker.state}
            mapState={mapState}
            onUpdateEntry={tracker.updateEntry}
            onRemoveEntry={tracker.removeEntry}
            onNextTurn={tracker.nextTurn}
            onClear={tracker.clear}
            selectedTokenCount={selectableTokenStates.length}
            onAddSelectedToCombat={handleAddSelectedToCombat}
            onMapTokenStateChange={onMapTokenStateChange}
          />
        </Popover>
      )}
    </>
  );
}

export default MapDock;
