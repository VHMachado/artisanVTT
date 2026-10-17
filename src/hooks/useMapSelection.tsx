import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { v4 as uuid } from "uuid";

import SelectionDragOverlay from "../components/selection/SelectionDragOverlay";
import SelectionMenu from "../components/selection/SelectionMenu";
import SelectTool from "../components/tools/SelectTool";
import { useBlur, useKeyboard } from "../contexts/KeyboardContext";
import { useUserId } from "../contexts/UserIdContext";
import { useIsSpectator } from "../contexts/SpectatorContext";
import { useArtisanStore } from "../state/artisanStore";
import shortcuts from "../shortcuts";
import { MouseButtonBindings, isToolBound } from "../helpers/mouseBindings";
import { boundingSelectionForTokens } from "../helpers/selection";
import {
  SelectionItemsChangeEventHandler,
  SelectionItemsCreateEventHandler,
  SelectionItemsRemoveEventHandler,
} from "../types/Events";
import { Map } from "../types/Map";
import { MapState } from "../types/MapState";
import { Selection } from "../types/Select";
import { SelectToolSettings } from "../types/Select";
import { TokenState } from "../types/TokenState";

/** Tokens the current player isn't allowed to move: every token, if
 * they're a spectator; otherwise just whichever ones someone else owns,
 * and only once the map owner has locked "tokens" edits down. Shared
 * with `useMapTokens`, which applies the identical rule to gate
 * dragging/removal on the rendered `Token` nodes themselves. */
export function computeDisabledTokens(
  map: Map | null,
  mapState: MapState | null,
  userId: string | undefined,
  isSpectator: boolean
): Record<string, boolean> {
  const disabled: Record<string, boolean> = {};
  if (!mapState) {
    return disabled;
  }
  if (isSpectator) {
    for (const token of Object.values(mapState.tokens)) {
      disabled[token.id] = true;
    }
    return disabled;
  }
  const ownsMap = !map || map.owner === userId;
  const tokensLocked = !mapState.editFlags.includes("tokens");
  if (!ownsMap && tokensLocked) {
    for (const token of Object.values(mapState.tokens)) {
      if (token.owner !== userId) {
        disabled[token.id] = true;
      }
    }
  }
  return disabled;
}

/** Builds the `Selection` shape both the marquee tool and a token click
 * produce — a rectangle whose only job is to carry which token ids are
 * selected and their combined bounding box. */
function buildTokenSelection(tokenIds: string[], mapState: MapState): Selection {
  return {
    type: "rectangle",
    items: tokenIds.map((id) => ({ type: "token" as const, id })),
    x: 0,
    y: 0,
    data: boundingSelectionForTokens(tokenIds, mapState),
    builtByClick: true,
  };
}

/** Shift+Delete-to-duplicate and Delete-to-remove, wired to the keyboard
 * bus — pulled out of the hook body since both handlers are pure
 * reactions to a held/released key, not state the rest of the hook
 * reads. */
function useDuplicateAndDeleteShortcuts(
  selection: Selection | null,
  selectionActive: boolean,
  onRemoveSelection: (tokenStateIds: string[]) => void,
  onSelectionMenuClose: () => void
) {
  const [duplicateSelection, setDuplicateSelection] = useState(false);

  useKeyboard(
    (event) => {
      if (shortcuts.duplicate(event)) {
        setDuplicateSelection(true);
      }
      if (shortcuts.delete(event) && selection && selectionActive) {
        onRemoveSelection(selection.items.map((item) => item.id));
        onSelectionMenuClose();
      }
    },
    (event) => {
      if (shortcuts.duplicate(event)) {
        setDuplicateSelection(false);
      }
    }
  );
  useBlur(() => setDuplicateSelection(false));

  return duplicateSelection;
}

function useMapSelection(
  map: Map | null,
  mapState: MapState | null,
  onSelectionItemsChange: SelectionItemsChangeEventHandler,
  onSelectionItemsRemove: SelectionItemsRemoveEventHandler,
  onSelectionItemsCreate: SelectionItemsCreateEventHandler,
  /** Substitui a antiga `selectedToolId` única. */
  bindings: MouseButtonBindings,
  settings: SelectToolSettings
) {
  const userId = useUserId();
  const isSpectator = useIsSpectator();
  const disabledTokens = computeDisabledTokens(map, mapState, userId, isSpectator);

  const [isSelectionMenuOpen, setIsSelectionMenuOpen] = useState(false);
  const [isSelectionDragging, setIsSelectionDragging] = useState(false);
  const selection = useArtisanStore((state) => state.mapSelection);
  const setSelection = useArtisanStore((state) => state.setMapSelection);
  const updateSelection = useArtisanStore((state) => state.updateMapSelection);

  const onSelectionChange: Dispatch<SetStateAction<Selection | null>> = (
    value
  ) => {
    if (typeof value === "function") {
      updateSelection(value as (prev: Selection | null) => Selection | null);
    } else {
      setSelection(value);
    }
  };

  const active = isToolBound("select", bindings);
  // Shift+click multi-selection (user request): works whenever the LEFT
  // button currently drives either "Mover" or "Selecionar" — not only
  // while the marquee tool itself is bound. `active` above stays the
  // marquee-drag-specific flag SelectTool's brush handlers gate on;
  // this is the broader flag for everything that should also respond to
  // a click-built selection (deselect-on-background-click, copy/paste,
  // delete, clearing on an unrelated tool switch).
  const clickSelectEnabled =
    bindings.left === "move" || bindings.left === "select";
  const selectionActive = active || clickSelectEnabled;

  // Remove selection when changing tools (but keep it across a
  // move<->select switch, since shift+click building a selection while
  // "Mover" is bound is the whole point of this feature).
  useEffect(() => {
    if (!selectionActive) {
      setSelection(null);
      setIsSelectionMenuOpen(false);
    }
  }, [selectionActive]);

  // Remove selection when changing maps
  useEffect(() => {
    setSelection(null);
    setIsSelectionMenuOpen(false);
  }, [map]);

  function handleSelectionItemsRemove(tokenStateIds: string[]) {
    setSelection(null);
    onSelectionItemsRemove(tokenStateIds);
  }

  const duplicateSelection = useDuplicateAndDeleteShortcuts(
    selection,
    selectionActive,
    handleSelectionItemsRemove,
    () => setIsSelectionMenuOpen(false)
  );

  function handleSelectionDragStart() {
    if (duplicateSelection && selection) {
      const tokenStates: TokenState[] = [];
      for (const item of selection.items) {
        const token = mapState?.tokens[item.id];
        if (token && !token.locked) {
          tokenStates.push({ ...token, id: uuid() });
        }
      }
      onSelectionItemsCreate(tokenStates);
    }
    setIsSelectionDragging(true);
  }

  function handleSelectionDragEnd() {
    setIsSelectionDragging(false);
  }

  /**
   * Shift+click toggles a token in/out of the current selection, reusing
   * the exact same `Selection` shape the marquee tool builds — so
   * dragging any one of them moves the whole group through the
   * already-existing `components/konva/Selection.tsx` behaviour, with no
   * separate multi-drag code path. Ignored for a token the user isn't
   * allowed to move (same `disabledTokens` gate the marquee hit-test
   * already applies).
   */
  function handleTokenShiftClick(tokenId: string) {
    if (!mapState || tokenId in disabledTokens) {
      return;
    }
    updateSelection((prevSelection) => {
      const existingIds = prevSelection
        ? prevSelection.items.map((item) => item.id)
        : [];
      const nextIds = existingIds.includes(tokenId)
        ? existingIds.filter((id) => id !== tokenId)
        : [...existingIds, tokenId];
      return nextIds.length === 0
        ? null
        : buildTokenSelection(nextIds, mapState);
    });
  }

  /**
   * Pedido do usuário (2026-10-12, quarta rodada): um clique NORMAL (sem
   * shift) num token agora SEMEIA a seleção com só esse token, em vez de
   * deixar `selection` intocado — é o que faz um shift+click NO SEGUNDO
   * token de fato estender a partir do primeiro (antes, clicar em A e
   * depois shift+clicar em B só selecionava B, porque nada tinha
   * semeado A na seleção). Sempre SUBSTITUI (nunca alterna) — um clique
   * comum em qualquer token reinicia a seleção para conter só ele,
   * igual à semântica usual de "clicar troca o alvo, shift+clique
   * estende" já aplicada pelo clique-em-vazio (deseleciona tudo).
   */
  function handleTokenClick(tokenId: string) {
    if (!mapState || tokenId in disabledTokens) {
      return;
    }
    setSelection(buildTokenSelection([tokenId], mapState));
  }

  const selectionTool = map ? (
    <SelectTool
      bindings={bindings}
      toolSettings={settings}
      onSelectionItemsChange={onSelectionItemsChange}
      selection={selection}
      onSelectionChange={onSelectionChange}
      onSelectionMenuOpen={setIsSelectionMenuOpen}
      onSelectionDragStart={handleSelectionDragStart}
      onSelectionDragEnd={handleSelectionDragEnd}
      disabledTokens={disabledTokens}
      map={map}
    />
  ) : null;

  function closeSelectionMenu() {
    setIsSelectionMenuOpen(false);
  }

  function openSelectionMenu() {
    setIsSelectionMenuOpen(true);
  }

  const selectionMenu = (
    <SelectionMenu
      map={map}
      mapState={mapState}
      selection={selection}
      isOpen={isSelectionMenuOpen}
      onSelectionChange={onSelectionChange}
      onSelectionItemsChange={onSelectionItemsChange}
      onSelectionItemsCreate={onSelectionItemsCreate}
      onRequestOpen={openSelectionMenu}
      onRequestClose={closeSelectionMenu}
      // Ajuste do usuário (2026-10-12): NÃO usar `selectionActive` aqui —
      // esse flag é mais amplo (inclui "Mover") só para a lógica de
      // limpar/manter a seleção por shift+click. Repassado ao
      // SelectionMenu, ele reativava os listeners internos que abrem o
      // menu de "Colar" (ícone de prancheta) com qualquer clique vazio
      // no mapa enquanto "Mover" está no botão esquerdo — um botão
      // misterioso que surgia sem nenhuma seleção, bug reportado pelo
      // usuário. `active` (estritamente "Selecionar" vinculado) é o
      // escopo correto e original para esse comportamento.
      active={active}
    />
  );

  const selectionDragOverlay = selection ? (
    <SelectionDragOverlay
      dragging={isSelectionDragging}
      selection={selection}
      onSelectionItemsRemove={handleSelectionItemsRemove}
    />
  ) : null;

  return {
    selectionTool,
    selectionMenu,
    selectionDragOverlay,
    selection,
    onTokenShiftClick: handleTokenShiftClick,
    onTokenClick: handleTokenClick,
    shiftSelectEnabled: clickSelectEnabled,
    /**
     * Pedido do usuário (2026-10-12, quarta rodada): "Adicionar
     * selecionados ao combate" deve limpar a seleção da grid — exposto
     * para MapDock.tsx chamar depois de `tracker.addTokenEntries`
     * (ver Map.tsx, que repassa isto como prop).
     */
    clearSelection: () => setSelection(null),
  };
}

export default useMapSelection;
