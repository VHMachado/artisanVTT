import { useState } from "react";
import { Group } from "react-konva";
import Konva from "konva";
import { v4 as uuid } from "uuid";

import type { Map } from "../types/Map";
import type { MapState } from "../types/MapState";
import type {
  TokenCategory,
  TokenDraggingOptions,
  TokenMenuOptions,
} from "../types/Token";
import type { TokenState } from "../types/TokenState";
import type {
  TokenStateRemoveHandler,
  TokenStateChangeEventHandler,
  TokensStateCreateHandler,
} from "../types/Events";
import Token from "../components/konva/Token";
import { KonvaEventObject } from "konva/lib/Node";
import TokenMenu from "../components/token/TokenMenu";
import TokenMonsterMenu from "../components/monster/TokenMonsterMenu";
import MonsterFormModal from "../modals/MonsterFormModal";
import MonsterArtModal from "../modals/MonsterArtModal";
import MonsterStatBlockModal from "../modals/MonsterStatBlockModal";
import TokenLightModal from "../modals/TokenLightModal";
import ConfirmModal from "../modals/ConfirmModal";
import { ContextMenuPosition } from "../components/ContextMenu";
import { useUserId } from "../contexts/UserIdContext";
import { useBlur, useKeyboard } from "../contexts/KeyboardContext";
import { useAccount } from "../contexts/AccountContext";
import { useAssets } from "../contexts/AssetsContext";
import { useIsSpectator } from "../contexts/SpectatorContext";
import { switchMonsterTokenVariant } from "../helpers/monsterToken";
import { deleteTableMonsterLocally } from "../helpers/tablesSync";
import shortcuts from "../shortcuts";
import { MouseButtonBindings } from "../helpers/mouseBindings";
import { computeDisabledTokens } from "./useMapSelection";

import type { Monster } from "../types/Monster";
import type { TableMonster } from "../types/TableMonster";

/** Shift+Delete-to-duplicate, mirrored by useMapSelection's identical
 * shortcut for its own "duplicate the current selection" gesture — kept
 * as its own hook here because dragging a token is the other half of
 * the same "hold the key, then drag" flow `handleTokenDragStart` reads
 * `duplicateToken` from. */
function useDuplicateTokenShortcut() {
  const [duplicateToken, setDuplicateToken] = useState(false);

  useKeyboard(
    (event) => {
      if (shortcuts.duplicate(event)) {
        setDuplicateToken(true);
      }
    },
    (event) => {
      if (shortcuts.duplicate(event)) {
        setDuplicateToken(false);
      }
    }
  );
  useBlur(() => setDuplicateToken(false));

  return duplicateToken;
}

function useTokenMenuController() {
  const [isOpen, setOpen] = useState(false);
  const [options, setOptions] = useState<TokenMenuOptions>();

  return {
    isOpen,
    options,
    open(tokenStateId: string, tokenImage: Konva.Node, focus: boolean) {
      setOptions({ tokenStateId, tokenImage, focus });
      setOpen(true);
    },
    close() {
      setOpen(false);
    },
  };
}

/** Modal/menu state for a monster token's right-click actions (Fase
 * 12h/12f/14): variant grid, derive/edit forms, art overlay, stat
 * block, delete confirmation, light editor. Grouped into one hook since
 * every piece is read-or-written only by `TokenMonsterMenu` and the
 * modals it opens, never by the token-rendering half of this file. */
function useMonsterTokenMenus() {
  const [monsterMenuTokenId, setMonsterMenuTokenId] = useState<string | null>(
    null
  );
  const [monsterMenuPosition, setMonsterMenuPosition] =
    useState<ContextMenuPosition | null>(null);
  const [monsterStatBlockIndex, setMonsterStatBlockIndex] = useState<
    string | null
  >(null);
  const [monsterForm, setMonsterForm] = useState<
    false | { monster?: TableMonster; parent?: Monster; parentIndex?: string }
  >(false);
  const [monsterArtTarget, setMonsterArtTarget] = useState<
    false | { monster: Monster; overlay?: TableMonster }
  >(false);
  const [deletingMonster, setDeletingMonster] = useState<TableMonster | null>(
    null
  );
  const [lightTokenId, setLightTokenId] = useState<string | null>(null);

  function open(tokenStateId: string, clientX: number, clientY: number) {
    setMonsterMenuTokenId(tokenStateId);
    setMonsterMenuPosition({ x: clientX, y: clientY });
  }

  function close() {
    setMonsterMenuTokenId(null);
    setMonsterMenuPosition(null);
  }

  async function confirmDeleteMonster() {
    if (!deletingMonster) {
      return;
    }
    await deleteTableMonsterLocally(deletingMonster.id, deletingMonster.tableId);
    setDeletingMonster(null);
  }

  return {
    monsterMenuTokenId,
    monsterMenuPosition,
    monsterStatBlockIndex,
    monsterForm,
    monsterArtTarget,
    deletingMonster,
    lightTokenId,
    setMonsterStatBlockIndex,
    setMonsterForm,
    setMonsterArtTarget,
    setDeletingMonster,
    setLightTokenId,
    open,
    close,
    confirmDeleteMonster,
  };
}

/** Konva reports which nodes are mid-transform (resize/rotate via the
 * selection transformer) only through its own event payload, not as
 * React state — mirrored here as a small id list purely so
 * `tokenFromTokenState` can fade/highlight them while the gesture is in
 * progress. */
function useTransformingTokenIds() {
  const [ids, setIds] = useState<string[]>([]);

  return {
    ids,
    onStart(event: Konva.KonvaEventObject<Event>, attachments: Konva.Node[]) {
      const transformer = event.currentTarget as Konva.Transformer;
      setIds([...transformer.nodes(), ...attachments].map((node) => node.id()));
    },
    onEnd() {
      setIds([]);
    },
  };
}

function duplicateDraggedTokenStates(
  tokenIds: string[],
  mapState: MapState | null
): TokenState[] {
  return tokenIds.flatMap((tokenId) => {
    const source = mapState?.tokens[tokenId];
    return source ? [{ ...source, id: uuid() }] : [];
  });
}

function useMapTokens(
  map: Map | null,
  mapState: MapState | null,
  onTokenStateChange: TokenStateChangeEventHandler,
  onTokenStateRemove: TokenStateRemoveHandler,
  onTokensStateCreate: TokensStateCreateHandler,
  /** Qual ferramenta cada botão do mouse aciona —
   * substitui a antiga `selectedToolId` única (rail de seleção removido). */
  bindings: MouseButtonBindings,
  /** The Mesa being played — a monster token's right-click menu needs it
   * to resolve/edit the placing GM's bestiary content. */
  tableId: string,
  /**
   * Pedido do usuário (2026-10-12): shift+click multi-seleção — ver
   * useMapSelection.tsx. `onTokenShiftClick` toggla o token na seleção;
   * `activeSelectionIds` é lido para destacar visualmente os tokens já
   * na seleção (mesmo `selected` que já existia para o TokenMenu) e,
   * desde 2026-10-26, TAMBÉM para liberar `draggable` em qualquer token
   * dela — cobre tanto um grupo por shift+click quanto um grupo
   * resolvido por marquee (MapScreen.tsx's `activeSelectionIds`, só
   * preenchido quando `selection.resolved`); `shiftSelectEnabled`
   * espelha useMapSelection's `shiftSelectEnabled`.
   */
  onTokenShiftClick: (tokenId: string) => void,
  /**
   * Pedido do usuário (2026-10-12, quarta rodada): um clique NORMAL
   * agora também semeia a seleção com só este token (ver
   * useMapSelection.tsx's handleTokenClick) — é o que faz um
   * shift+click NO SEGUNDO token de fato estender a partir do
   * primeiro, em vez de a seleção só começar a partir do clique com
   * shift.
   */
  onTokenClick: (tokenId: string) => void,
  activeSelectionIds: Set<string>,
  shiftSelectEnabled: boolean,
  /**
   * Pedido do usuário (2026-10-12, quarta rodada): id do token cuja
   * entrada está ATIVA no combat tracker agora (ver
   * helpers/initiative.ts's activeEntryTokenId, lido em Map.tsx) —
   * undefined fora de combate ou quando a entrada ativa não tem token
   * vinculado. Síncrono para TODOS os clientes (o canal "initiative" já
   * é rebroadcast a todos — ver useInitiativeTracker.ts), não só o
   * Mestre: saber de quem é o turno é informação do JOGO, diferente do
   * painel de edição do tracker (esse sim Mestre-only).
   */
  activeTokenId: string | undefined
) {
  const userId = useUserId();
  const { session } = useAccount();
  const { getAsset, putAsset } = useAssets();
  // The Espectador window shares the Mestre's own account (see
  // helpers/spectator.ts), so `map.owner === userId` reads true there too
  // — without this override, a Mesa whose editFlags/owner checks would
  // otherwise allow moving a token also lets the read-only viewer drag it.
  const isSpectator = useIsSpectator();
  const disabledTokens = computeDisabledTokens(map, mapState, userId, isSpectator);

  const tokenMenuController = useTokenMenuController();
  const [tokenDraggingOptions, setTokenDraggingOptions] =
    useState<TokenDraggingOptions>();

  // Right-click on a placed monster token opens the same
  // actions menu as its bestiary panel row, plus a
  // variant-switch thumbnail grid. Modal state lives HERE (not inside
  // TokenMonsterMenu) because closing the menu unmounts that component —
  // see TokenMonsterMenu.tsx's own comment on why.
  const monsterMenu = useMonsterTokenMenus();

  async function handleTokenVariantSelect(
    index: number,
    variantAssetIds: string[]
  ) {
    const tokenState =
      monsterMenu.monsterMenuTokenId && mapState?.tokens[monsterMenu.monsterMenuTokenId];
    const assetId = variantAssetIds[index];
    if (!tokenState || !assetId || !userId) {
      return;
    }
    const patch = await switchMonsterTokenVariant(
      assetId,
      index,
      variantAssetIds,
      session,
      getAsset,
      putAsset,
      userId
    );
    if (!patch) {
      return;
    }
    onTokenStateChange({
      [tokenState.id]: {
        ...patch,
        lastModifiedBy: userId,
        lastModified: Date.now(),
      },
    });
  }

  const duplicateToken = useDuplicateTokenShortcut();

  function handleTokenDragStart(
    _: KonvaEventObject<DragEvent>,
    tokenStateId: string,
    attachedTokenStateIds: string[]
  ) {
    if (duplicateToken) {
      onTokensStateCreate(
        duplicateDraggedTokenStates(
          [tokenStateId, ...attachedTokenStateIds],
          mapState
        )
      );
    }
    setTokenDraggingOptions({
      dragging: true,
      tokenStateId,
      attachedTokenStateIds,
    });
  }

  function handleTokenDragEnd() {
    if (tokenDraggingOptions) {
      setTokenDraggingOptions({ ...tokenDraggingOptions, dragging: false });
    }
  }

  function handleTokenStateRemove(tokenStateIds: string[]) {
    onTokenStateRemove(tokenStateIds);
    setTokenDraggingOptions(undefined);
  }

  const transformingTokens = useTransformingTokenIds();

  function tokenFromTokenState(tokenState: TokenState) {
    return (
      map &&
      mapState && (
        <Token
          key={tokenState.id}
          tokenState={tokenState}
          onTokenStateChange={onTokenStateChange}
          onTokenMenuOpen={tokenMenuController.open}
          onTokenMenuClose={tokenMenuController.close}
          onTokenMonsterMenuOpen={monsterMenu.open}
          onTokenDragStart={handleTokenDragStart}
          onTokenDragEnd={handleTokenDragEnd}
          onTokenTransformStart={transformingTokens.onStart}
          onTokenTransformEnd={transformingTokens.onEnd}
          transforming={transformingTokens.ids.includes(tokenState.id)}
          // O Konva nativo de arraste do token só
          // responde ao botão ESQUERDO/meio (`Konva.dragButtons`, nunca
          // alterado por esta funcionalidade) — então "mover token" depende
          // especificamente de "move" estar no botão esquerdo, não em
          // QUALQUER botão (um "move" só no direito não arrastaria o
          // token de qualquer forma, e checar `isToolBound` aqui
          // ligaria o arraste nativo também quando só o direito tivesse
          // "move", confundindo o usuário). Bug fix (2026-10-26): também
          // liberado quando o token já pertence à seleção ATIVA
          // (shift+click OU marquee resolvida, ver
          // activeSelectionIds/types/Select.ts's `resolved`) — sem
          // isso, com "Selecionar" no botão esquerdo, nenhum token de
          // um grupo marcado por marquee podia ser arrastado clicando
          // nele direto, só pela antiga shape de contorno.
          draggable={
            (bindings.left === "move" || activeSelectionIds.has(tokenState.id)) &&
            !(tokenState.id in disabledTokens) &&
            !tokenState.locked
          }
          selectable={
            // Pedido do usuário (2026-10-12, quarta rodada): clicar
            // tokens com a ferramenta "Selecionar" vinculada ao botão
            // esquerdo deve construir a MESMA seleção por clique/shift
            // que "Mover" já constrói (ver useMapSelection.tsx's
            // handleTokenClick/handleTokenShiftClick) — antes disto só
            // "move" entrava aqui, então um clique num token com
            // "Selecionar" ativo não selecionava nada (caía só na
            // marquee, que exige arrastar). `draggable` acima continua
            // só em "move": arrastar um token com a marquee ativa
            // continuaria disputando o próprio gesto de arraste dela.
            (bindings.left === "move" || bindings.left === "select") &&
            ((!(tokenState.id in disabledTokens) && !tokenState.locked) ||
              (map.owner === userId && !isSpectator))
          }
          // Gates the right-click menu's "Excluir" entry — same
          // permission `draggable` already checks (ownership/editFlags via
          // disabledTokens, plus the token's own lock), independent of
          // `selectedToolId` since the context menu opens regardless of
          // which tool is active.
          canRemove={!(tokenState.id in disabledTokens) && !tokenState.locked}
          fadeOnHover={false}
          map={map}
          mapState={mapState}
          selected={
            (tokenMenuController.isOpen &&
              tokenMenuController.options?.tokenStateId === tokenState.id) ||
            activeSelectionIds.has(tokenState.id)
          }
          onTokenShiftClick={onTokenShiftClick}
          onTokenClick={onTokenClick}
          shiftSelectEnabled={shiftSelectEnabled}
          groupSelectedIds={
            activeSelectionIds.has(tokenState.id) && activeSelectionIds.size > 1
              ? Array.from(activeSelectionIds).filter((id) => id !== tokenState.id)
              : []
          }
          isActiveTurn={activeTokenId === tokenState.id}
        />
      )
    );
  }

  /** Renders every token matching `isProp`, sorted by the shared
   * z-order rule — the body both `tokens` and `propTokens` shared
   * below, differing only in which side of the "prop" filter they
   * wanted. */
  function renderTokenLayer(isProp: boolean) {
    if (!map || !mapState) {
      return null;
    }
    return (
      <Group id="tokens">
        {Object.values(mapState.tokens)
          .filter((tokenState) => (tokenState.category === "prop") === isProp)
          .sort((a, b) => sortMapTokenStates(a, b, tokenDraggingOptions))
          .map(tokenFromTokenState)}
      </Group>
    );
  }

  const tokens = renderTokenLayer(false);
  const propTokens = renderTokenLayer(true);

  const tokenMenuState = tokenMenuController.options
    ? mapState?.tokens[tokenMenuController.options.tokenStateId]
    : undefined;
  const tokenMenu = (
    <TokenMenu
      {...{
        map,
        tokenImage: tokenMenuController.options?.tokenImage,
        focus: tokenMenuController.options?.focus,
        tokenState: tokenMenuState,
        onTokenStateChange,
        onRequestClose: tokenMenuController.close,
        isOpen: tokenMenuController.isOpen,
      }}
    />
  );

  const monsterMenuTokenState =
    monsterMenu.monsterMenuTokenId &&
    mapState?.tokens[monsterMenu.monsterMenuTokenId];
  const monsterMenuCanRemove = Boolean(
    monsterMenuTokenState &&
      !(monsterMenuTokenState.id in disabledTokens) &&
      !monsterMenuTokenState.locked
  );
  // Only the map's Mestre configures a token's light — darkness
  // is a GM staging decision, and the Espectador window shares the GM's
  // account so it needs the explicit isSpectator term (see
  // SpectatorContext).
  const canEditLight = Boolean(map && map.owner === userId && !isSpectator);
  const tokenMonsterMenu = monsterMenu.monsterMenuPosition && monsterMenuTokenState && (
    <TokenMonsterMenu
      position={monsterMenu.monsterMenuPosition}
      onRequestClose={monsterMenu.close}
      tokenState={monsterMenuTokenState}
      tableId={tableId}
      onOpenStatBlock={monsterMenu.setMonsterStatBlockIndex}
      onDerive={(parent, parentIndex) =>
        monsterMenu.setMonsterForm({ parent, parentIndex })
      }
      onEditArt={(monster, overlay) =>
        monsterMenu.setMonsterArtTarget({ monster, overlay })
      }
      onEdit={(monster, parent) =>
        monsterMenu.setMonsterForm({ monster, parent })
      }
      onDelete={(monster) => monsterMenu.setDeletingMonster(monster)}
      onVariantSelect={handleTokenVariantSelect}
      canRemove={monsterMenuCanRemove}
      onRemove={() => handleTokenStateRemove([monsterMenuTokenState.id])}
      onEditLight={
        canEditLight
          ? () => monsterMenu.setLightTokenId(monsterMenuTokenState.id)
          : undefined
      }
    />
  );

  const lightTokenState = monsterMenu.lightTokenId
    ? mapState?.tokens[monsterMenu.lightTokenId]
    : undefined;
  const tokenLightModal = (
    <TokenLightModal
      isOpen={Boolean(lightTokenState)}
      onRequestClose={() => monsterMenu.setLightTokenId(null)}
      light={lightTokenState?.light}
      tokenLabel={lightTokenState?.label || undefined}
      onChange={(light) => {
        if (!lightTokenState) {
          return;
        }
        onTokenStateChange({
          [lightTokenState.id]: {
            light,
            lastModifiedBy: userId,
            lastModified: Date.now(),
          },
        });
      }}
    />
  );

  const monsterModals = (
    <>
      <MonsterStatBlockModal
        isOpen={monsterMenu.monsterStatBlockIndex !== null}
        onRequestClose={() => monsterMenu.setMonsterStatBlockIndex(null)}
        monsterIndex={monsterMenu.monsterStatBlockIndex}
        tableId={tableId}
      />
      {monsterMenu.monsterForm !== false && (
        <MonsterFormModal
          isOpen
          onRequestClose={() => monsterMenu.setMonsterForm(false)}
          tableId={tableId}
          monster={monsterMenu.monsterForm.monster}
          parent={monsterMenu.monsterForm.parent}
          parentIndex={monsterMenu.monsterForm.parentIndex}
        />
      )}
      {monsterMenu.monsterArtTarget !== false && (
        <MonsterArtModal
          isOpen
          onRequestClose={() => monsterMenu.setMonsterArtTarget(false)}
          tableId={tableId}
          monster={monsterMenu.monsterArtTarget.monster}
          overlay={monsterMenu.monsterArtTarget.overlay}
        />
      )}
      <ConfirmModal
        isOpen={Boolean(monsterMenu.deletingMonster)}
        onRequestClose={() => monsterMenu.setDeletingMonster(null)}
        onConfirm={monsterMenu.confirmDeleteMonster}
        confirmText="Excluir"
        label="Excluir criatura"
        description={
          monsterMenu.deletingMonster
            ? `Isso remove "${monsterMenu.deletingMonster.name}" da Mesa para sempre.`
            : ""
        }
      />
    </>
  );

  return {
    tokens,
    propTokens,
    tokenMenu,
    tokenMonsterMenu,
    tokenLightModal,
    monsterModals,
  };
}

export default useMapTokens;

const TOKEN_CATEGORY_WEIGHT: Record<TokenCategory, number> = {
  attachment: 0,
  character: 1,
  vehicle: 2,
  prop: 3,
};

/** Whichever of `a`/`b` is the token currently being dragged, if either
 * is — used by `sortMapTokenStates` to float it to the top of its
 * z-order group while the drag is in progress. */
function draggedTokenPriority(
  a: TokenState,
  b: TokenState,
  tokenDraggingOptions?: TokenDraggingOptions
): number | undefined {
  if (!tokenDraggingOptions?.dragging) {
    return undefined;
  }
  if (tokenDraggingOptions.tokenStateId === a.id) {
    return 1;
  }
  if (tokenDraggingOptions.tokenStateId === b.id) {
    return -1;
  }
  return undefined;
}

/** Render order within the tokens `<Group>`: category first (props at
 * the bottom, attachments on top), then whichever token is mid-drag
 * floats above its siblings, then last-modified-on-top as the default
 * within an otherwise tied group. */
function sortMapTokenStates(
  a: TokenState,
  b: TokenState,
  tokenDraggingOptions?: TokenDraggingOptions
) {
  if (b.category !== a.category) {
    return TOKEN_CATEGORY_WEIGHT[b.category] - TOKEN_CATEGORY_WEIGHT[a.category];
  }
  const draggedPriority = draggedTokenPriority(a, b, tokenDraggingOptions);
  if (draggedPriority !== undefined) {
    return draggedPriority;
  }
  return a.lastModified - b.lastModified;
}
