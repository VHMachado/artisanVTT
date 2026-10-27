import { useState, useRef, useCallback, useMemo } from "react";
import { Image as KonvaImage, Group } from "react-konva";
import { useSpring, animated } from "@react-spring/konva";
import Konva from "konva";
import useImage from "use-image";

import usePrevious from "../../hooks/usePrevious";
import useGridSnapping from "../../hooks/useGridSnapping";

import theme from "../../theme";
import { useUserId } from "../../contexts/UserIdContext";
import {
  useSetPreventMapInteraction,
  useMapWidth,
  useMapHeight,
  leftMouseButton,
} from "../../contexts/MapInteractionContext";
import { useGridCellPixelSize } from "../../contexts/GridContext";
import { useDataURL } from "../../contexts/AssetsContext";
import { useIsSpectator } from "../../contexts/SpectatorContext";

import TokenStatus from "./TokenStatus";
import TokenLabel from "./TokenLabel";
import TokenOutline from "./TokenOutline";
import TokenHighlightOutline from "./TokenHighlightOutline";

import { Intersection, getScaledOutline } from "../../helpers/token";
import { monsterIndexFromTokenId } from "../../helpers/monsterToken";
import { cardinalRotationForMovement } from "../../helpers/cardinalDrag";
import Vector2 from "../../helpers/Vector2";

import { tokenSources } from "../../tokens";
import { TokenState } from "../../types/TokenState";
import { Map } from "../../types/Map";
import {
  TokenDragEventHandler,
  TokenMenuCloseChangeEventHandler,
  TokenMenuOpenChangeEventHandler,
  TokenStateChangeEventHandler,
  TokenMonsterMenuOpenEventHandler,
  CustomTransformEventHandler,
} from "../../types/Events";
import Transformer from "./Transformer";
import TokenAttachment from "./TokenAttachment";
import { MapState } from "../../types/MapState";

type MapTokenProps = {
  tokenState: TokenState;
  onTokenStateChange: TokenStateChangeEventHandler;
  onTokenMenuOpen: TokenMenuOpenChangeEventHandler;
  onTokenMenuClose: TokenMenuCloseChangeEventHandler;
  onTokenMonsterMenuOpen: TokenMonsterMenuOpenEventHandler;
  onTokenDragStart: TokenDragEventHandler;
  onTokenDragEnd: TokenDragEventHandler;
  onTokenTransformStart: CustomTransformEventHandler;
  onTokenTransformEnd: CustomTransformEventHandler;
  transforming: boolean;
  draggable: boolean;
  selectable: boolean;
  /** Whether this user is allowed to remove this token — gates the
   * right-click "Excluir" entry (see TokenMonsterMenu.tsx, which now
   * doubles as the generic token context menu). Mirrors the same
   * ownership/editFlags permission `draggable` already uses, computed in
   * useMapTokens.tsx where the disabledTokens map lives. */
  canRemove: boolean;
  fadeOnHover: boolean;
  map: Map;
  mapState: MapState;
  selected: boolean;
  /**
   * Pedido do usuário (2026-10-12): shift+click adiciona/remove este
   * token de uma seleção múltipla sem abrir o TokenMenu — só chamado
   * quando `shiftSelectEnabled` (o botão esquerdo toca "Mover" ou
   * "Selecionar", ver useMapSelection.tsx), senão shift+click se
   * comporta como um clique comum.
   */
  onTokenShiftClick: (tokenId: string) => void;
  /**
   * Pedido do usuário (2026-10-12, quarta rodada): um clique NORMAL
   * (sem shift) também passa por aqui quando `shiftSelectEnabled` —
   * semeia a seleção múltipla com só este token (ver
   * useMapSelection.tsx's handleTokenClick), para um shift+click
   * SUBSEQUENTE estender a partir dele em vez de a seleção só nascer a
   * partir do primeiro clique QUE JÁ TEM shift. Chamado em vez de (não
   * além de) abrir o TokenMenu — ver handleClick.
   */
  onTokenClick: (tokenId: string) => void;
  shiftSelectEnabled: boolean;
  /**
   * Pedido do usuário (2026-10-12): outros ids da seleção múltipla por
   * shift+click que este token está em (vazio quando não é parte de
   * nenhuma, ou a seleção tem só este token) — arrastar QUALQUER um
   * deles move todos juntos, reaproveitando a MESMA mecânica de
   * "tokens anexados" já usada para veículo+ocupante/personagem+anexo
   * abaixo (attachedTokensRef/getAttachedTokens): ver handleDragStart.
   */
  groupSelectedIds: string[];
  /**
   * Pedido do usuário (2026-10-12, quarta rodada): este token é o
   * combatente ATIVO no combat tracker agora — desenha o indicador de
   * turno (ver o bloco "indicador de turno" mais abaixo), no mesmo
   * estilo do indicador de seleção.
   */
  isActiveTurn: boolean;
};

function Token({
  tokenState,
  onTokenStateChange,
  onTokenMenuOpen,
  onTokenMenuClose,
  onTokenMonsterMenuOpen,
  onTokenDragStart,
  onTokenDragEnd,
  onTokenTransformStart,
  onTokenTransformEnd,
  transforming,
  draggable,
  selectable,
  canRemove,
  fadeOnHover,
  map,
  mapState,
  selected,
  onTokenShiftClick,
  onTokenClick,
  shiftSelectEnabled,
  groupSelectedIds,
  isActiveTurn,
}: MapTokenProps) {
  const userId = useUserId();
  const isSpectator = useIsSpectator();

  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const setPreventMapInteraction = useSetPreventMapInteraction();

  const gridCellPixelSize = useGridCellPixelSize();

  const tokenURL = useDataURL(tokenState, tokenSources);
  const [tokenImage] = useImage(tokenURL || "");

  const tokenAspectRatio = tokenState.width / tokenState.height;

  const snapPositionToGrid = useGridSnapping();

  const [dragging, setDragging] = useState(false);
  const previousDragPositionRef = useRef({ x: 0, y: 0 });

  // Feature: the token's front always turns to face the direction it's
  // being dragged in. Tracked independently from previousDragPositionRef
  // above (which only advances when there are attached tokens to carry
  // along) so the facing direction is recomputed on every drag move, not
  // just the ones that happen to also reposition an attachment.
  // currentDragRotationRef holds the rotation imperatively applied to
  // the Konva node mid-drag (never committed to tokenState until drag
  // end), starting from the token's last known rotation so a drag that
  // never moves far enough to update it still commits the same value.
  const previousRotationPositionRef = useRef({ x: 0, y: 0 });
  const currentDragRotationRef = useRef(tokenState.rotation);
  // Ignore sub-pixel jitter between consecutive drag move events so the
  // facing direction doesn't flicker on effectively-stationary moves.
  const rotationMoveThreshold = 0.5;

  // Tokens that are attached to this token and should move when it moves
  const attachedTokensRef = useRef<Konva.Node[]>([]);
  // Pedido do usuário (2026-10-12, quarta rodada, item 3): os
  // "transform-root" (o Group que de fato carrega a prop `rotation` —
  // ver o JSX retornado por este componente) dos OUTROS tokens da
  // mesma seleção múltipla por shift+click (groupSelectedIds) sendo
  // arrastados junto por `attachedTokensRef` acima. Sem isto, só o
  // token efetivamente clicado girava para encarar a direção do
  // arrasto (handleDragMove só mutava `transformRootRef.current`,
  // nunca os outros nodes movidos via attachedTokensRef, que só tinham
  // x/y) — pedido do usuário para que TODOS os selecionados girem
  // juntos ao serem movidos em grupo.
  const groupSelectedTransformRootsRef = useRef<Konva.Node[]>([]);
  // If this an attachment is it over a character
  const [attachmentOverCharacter, setAttachmentOverCharacter] = useState(false);
  // The characters that we're present when an attachment is dragged, used to highlight the attachment
  const attachmentCharactersRef = useRef<Konva.Node[]>([]);
  const attachmentThreshold = useMemo(
    () => Vector2.componentMin(gridCellPixelSize) / 4,
    [gridCellPixelSize]
  );

  function handleDragStart(event: Konva.KonvaEventObject<DragEvent>) {
    const tokenGroup = event.target as Konva.Shape;
    previousDragPositionRef.current = tokenGroup.position();
    previousRotationPositionRef.current = tokenGroup.position();
    currentDragRotationRef.current = tokenState.rotation;

    attachedTokensRef.current = getAttachedTokens();

    // Pedido do usuário (2026-10-12): arrastar qualquer token de uma
    // seleção múltipla por shift+click move TODOS juntos — mesma
    // mecânica de "tokens anexados" que veículo/personagem já usam
    // acima, estendida com os outros membros do grupo (resolvidos pelo
    // id, já que groupSelectedIds não inclui o próprio tokenState.id).
    groupSelectedTransformRootsRef.current = [];
    if (groupSelectedIds.length > 0) {
      const layer = tokenGroup.getLayer();
      for (let id of groupSelectedIds) {
        const node = layer?.findOne(`#${id}`);
        if (node && !attachedTokensRef.current.includes(node)) {
          attachedTokensRef.current.push(node);
          // Pedido do usuário (2026-10-12, quarta rodada, item 3): o
          // transform-root é quem carrega `rotation` (ver o retorno
          // JSX deste componente) — sem resolvê-lo aqui, girar o
          // grupo abaixo em handleDragMove não teria node para mutar.
          const transformRoot = (node as Konva.Group).findOne(
            ".transform-root"
          );
          if (transformRoot) {
            groupSelectedTransformRootsRef.current.push(transformRoot);
          }
        }
      }
    }

    if (tokenState.category === "attachment") {
      // If we're dragging an attachment add all characters to the attachment characters
      // So we can check for highlights
      const characters = tokenGroup.getLayer()?.find(".character") || [];
      attachmentCharactersRef.current = characters;
    }

    setDragging(true);
    onTokenDragStart(
      event,
      tokenState.id,
      attachedTokensRef.current.map((token) => token.id())
    );
  }

  function handleDragMove(event: Konva.KonvaEventObject<DragEvent>) {
    const tokenGroup = event.target;

    if (map.snapToGrid) {
      tokenGroup.position(snapPositionToGrid(tokenGroup.position()));
    }
    // A token can move freely in any direction, but its facing is always
    // one of the four cardinal directions. Exact diagonal ties favor the
    // vertical direction, so an upward diagonal faces up.
    const currentPosition = tokenGroup.position();
    const moveDelta = Vector2.subtract(
      currentPosition,
      previousRotationPositionRef.current
    );
    if (Vector2.magnitude(moveDelta) >= rotationMoveThreshold) {
      const facingRotation = cardinalRotationForMovement(moveDelta);
      if (facingRotation !== undefined) {
        currentDragRotationRef.current = facingRotation;
        transformRootRef.current?.rotation(facingRotation);
        // Pedido do usuário (2026-10-12, quarta rodada, item 3): girar
        // TODOS os outros transform-roots da seleção múltipla junto —
        // antes só o token efetivamente clicado (transformRootRef.current
        // acima) virava para encarar a direção do arrasto; os demais só
        // reposicionavam (ver bloco de `attachedTokensRef` abaixo), sem
        // nunca atualizar sua própria rotação.
        for (let transformRoot of groupSelectedTransformRootsRef.current) {
          (transformRoot as Konva.Group).rotation(facingRotation);
        }
        previousRotationPositionRef.current = currentPosition;
      }
    }
    if (attachedTokensRef.current.length > 0) {
      const deltaPosition = Vector2.subtract(
        tokenGroup.position(),
        previousDragPositionRef.current
      );
      for (let other of attachedTokensRef.current) {
        other.position(Vector2.add(other.position(), deltaPosition));
      }
      previousDragPositionRef.current = tokenGroup.position();
    }
    // Check whether an attachment is over a character
    if (tokenState.category === "attachment") {
      const characters = attachmentCharactersRef.current;
      let overCharacter = false;
      for (let character of characters) {
        const distance = Vector2.distance(
          tokenGroup.position(),
          character.position()
        );
        if (distance < attachmentThreshold) {
          overCharacter = true;
          break;
        }
      }
      if (attachmentOverCharacter !== overCharacter) {
        setAttachmentOverCharacter(overCharacter);
      }
    }
  }

  function handleDragEnd(event: Konva.KonvaEventObject<DragEvent>) {
    const tokenGroup = event.target;

    const attachedTokenChanges: Record<string, Partial<TokenState>> = {};
    if (attachedTokensRef.current.length > 0) {
      for (let other of attachedTokensRef.current) {
        attachedTokenChanges[other.id()] = {
          x: other.x() / mapWidth,
          y: other.y() / mapHeight,
          // Pedido do usuário (2026-10-12, quarta rodada, item 3): só os
          // membros da seleção múltipla (groupSelectedIds) também giram
          // (ver handleDragMove) — um veículo/anexo arrastado pelo seu
          // ocupante/personagem nunca girou independentemente antes
          // desta mudança, e não deve passar a girar agora.
          ...(groupSelectedIds.includes(other.id())
            ? { rotation: currentDragRotationRef.current }
            : {}),
          lastModifiedBy: userId,
          lastModified: Date.now(),
        };
      }
    }

    setPreventMapInteraction(false);
    onTokenStateChange({
      ...attachedTokenChanges,
      [tokenState.id]: {
        x: tokenGroup.x() / mapWidth,
        y: tokenGroup.y() / mapHeight,
        rotation: currentDragRotationRef.current,
        lastModifiedBy: userId,
        lastModified: Date.now(),
      },
    });

    setDragging(false);

    onTokenDragEnd(
      event,
      tokenState.id,
      attachedTokensRef.current.map((token) => token.id())
    );

    attachmentCharactersRef.current = [];
    attachedTokensRef.current = [];
    groupSelectedTransformRootsRef.current = [];
    setAttachmentOverCharacter(false);
  }

  function handleClick(event: Konva.KonvaEventObject<MouseEvent>) {
    if (!leftMouseButton(event)) {
      return;
    }
    // Pedido do usuário (2026-10-12): shift+click alterna este token
    // numa seleção múltipla em vez de abrir o TokenMenu — reaproveita
    // exatamente a mesma seleção/arraste em grupo da ferramenta
    // "Selecionar" (useMapSelection.tsx's handleTokenShiftClick), então
    // só precisa de `selectable` (a mesma checagem de permissão que já
    // gate o clique comum).
    if (shiftSelectEnabled && event.evt.shiftKey && selectable) {
      event.cancelBubble = true;
      onTokenShiftClick(tokenState.id);
      return;
    }
    // Pedido do usuário (2026-10-12, quarta rodada): um clique NORMAL
    // (sem shift) também semeia a seleção múltipla com só este token —
    // ver useMapSelection.tsx's handleTokenClick. Antes desta mudança,
    // nada preenchia `selection` num clique sem shift, então um
    // shift+click NO SEGUNDO token só continha ele mesmo (a seleção
    // "começava do segundo clique"), em vez de estender a partir do
    // primeiro. Isto acontece JUNTO com abrir o TokenMenu abaixo, não
    // em vez disso — são interações independentes (menu de edição do
    // token vs. seleção múltipla para mover em grupo).
    //
    // `cancelBubble` aqui é necessário: sem ele, o clique sobe até o
    // listener "click" do stage (SelectTool.tsx's handlePointerClick),
    // que vê um target que não é a shape "selection" e chama
    // `onSelectionChange(null)`, apagando a seleção que acabamos de
    // montar no mesmo gesto.
    if (shiftSelectEnabled && selectable) {
      event.cancelBubble = true;
      onTokenClick(tokenState.id);
    }
    if (selectable && draggable && transformRootRef.current) {
      onTokenMenuOpen(tokenState.id, transformRootRef.current, true);
    }
  }

  // Right-click a monster token opens the same actions menu as
  // right-clicking its row in the bestiary panel (Abrir ficha/Criar
  // variação/Editar imagens/Editar criatura), plus a variant-switch
  // thumbnail grid when the token carries more than one uploaded look —
  // see components/monster/MonsterContextMenu.tsx, rendered by
  // useMapTokens.tsx the same way TokenMenu already is (outside this
  // Konva subtree, so it isn't clipped/transformed by the canvas).
  //
  // Gated to the map's owner (the Mestre, same signal every
  // other GM-only control on this map already reads — camera sharing,
  // fog editing) — a Jogador has no use for these actions (derive/edit
  // homebrew content, switch a monster's art) and shouldn't be offered
  // them even though nothing but the menu itself was ever hiding them.
  const isMapOwner = map.owner === userId && !isSpectator;
  const isMonsterToken =
    isMapOwner && Boolean(monsterIndexFromTokenId(tokenState.tokenId));

  // The drag-to-trash icon is gone — every token (monster or
  // not) now offers "Excluir" as the last entry of this same right-click
  // menu, so a token still needs the menu to open even when it isn't a
  // monster, as long as the user is allowed to remove it.
  //
  // The same menu also carries "Luz" for the map's Mestre, so a
  // locked/undeletable token still opens it when the GM can configure
  // light — canRemove alone would swallow the gesture there.
  function handleContextMenu(event: Konva.KonvaEventObject<PointerEvent>) {
    // O menu de contexto do token abre SEMPRE no
    // botão direito, independente da ferramenta atualmente atribuída a
    // esse botão (`bindings.right`) — pedido explícito do usuário para
    // substituir uma regra antiga que suprimia o menu quando o
    // direito tinha qualquer ferramenta (ex.: laser) atribuída.
    if (!isMonsterToken && !canRemove && !isMapOwner) {
      return;
    }
    event.evt.preventDefault();
    onTokenMonsterMenuOpen(tokenState.id, event.evt.clientX, event.evt.clientY);
  }

  const [tokenOpacity, setTokenOpacity] = useState(1);
  // Store token pointer down time to check for a click when token is locked
  const tokenPointerDownTimeRef = useRef<number>(0);
  function handlePointerDown(event: Konva.KonvaEventObject<PointerEvent>) {
    if (!leftMouseButton(event)) {
      return;
    }
    if (draggable) {
      setPreventMapInteraction(true);
    }
    if (tokenState.locked && selectable) {
      tokenPointerDownTimeRef.current = event.evt.timeStamp;
    }
  }

  function handlePointerUp(event: Konva.KonvaEventObject<PointerEvent>) {
    if (!leftMouseButton(event)) {
      return;
    }
    if (draggable) {
      setPreventMapInteraction(false);
    }
    // Check token click when locked and selectable
    // We can't use onClick because that doesn't check pointer distance
    if (tokenState.locked && selectable && transformRootRef.current) {
      // If down and up time is small trigger a click
      const delta = event.evt.timeStamp - tokenPointerDownTimeRef.current;
      if (delta < 300) {
        // Pedido do usuário (2026-10-12): mesmo tratamento de
        // shift+click do handleClick acima, para um token LOCKED (que
        // nunca dispara onClick/handleClick do Konva — ver comentário
        // original sobre pointer distance).
        if (shiftSelectEnabled && event.evt.shiftKey) {
          onTokenShiftClick(tokenState.id);
        } else {
          // Pedido do usuário (2026-10-12, quarta rodada): mesmo
          // tratamento de "clique normal semeia a seleção" do
          // handleClick acima, para um token LOCKED.
          if (shiftSelectEnabled) {
            onTokenClick(tokenState.id);
          }
          onTokenMenuOpen(tokenState.id, transformRootRef.current, true);
        }
      }
    }
  }

  // O nome do token (TokenLabel) só aparece com o
  // mouse em cima dele, ou enquanto ele está selecionado (clicado) — não
  // mais sempre visível. `isHovered` segue o mesmo par
  // onPointerEnter/onPointerLeave que já existia para `fadeOnHover`.
  const [isHovered, setIsHovered] = useState(false);

  function handlePointerEnter() {
    if (fadeOnHover) {
      setTokenOpacity(0.5);
    }
    setIsHovered(true);
  }

  function handlePointerLeave() {
    if (tokenOpacity !== 1.0) {
      setTokenOpacity(1.0);
    }
    setIsHovered(false);
  }

  const transformRootRef = useRef<Konva.Group>(null);

  const minCellSize = Math.min(
    gridCellPixelSize.width,
    gridCellPixelSize.height
  );
  const tokenWidth = minCellSize * tokenState.size;
  const tokenHeight = (minCellSize / tokenAspectRatio) * tokenState.size;

  // Animate to new token positions if edited by others
  const tokenX = tokenState.x * mapWidth;
  const tokenY = tokenState.y * mapHeight;
  const previousWidth = usePrevious(mapWidth);
  const previousHeight = usePrevious(mapHeight);
  const resized = mapWidth !== previousWidth || mapHeight !== previousHeight;
  const skipAnimation = tokenState.lastModifiedBy === userId || resized;
  const props = useSpring({
    x: tokenX,
    y: tokenY,
    immediate: skipAnimation,
  });

  const getAttachedTokens = useCallback(() => {
    const transformRoot = transformRootRef.current;
    const tokenGroup = transformRoot?.parent;
    const layer = transformRoot?.getLayer();
    let attachedTokens: Konva.Node[] = [];
    if (tokenGroup && layer) {
      if (tokenState.category === "vehicle") {
        const tokenIntersection = new Intersection(
          getScaledOutline(tokenState, tokenWidth, tokenHeight),
          { x: tokenX - tokenWidth / 2, y: tokenY - tokenHeight / 2 },
          { x: tokenX, y: tokenY },
          tokenState.rotation
        );

        // Find all other characters on the map and check whether they're
        // intersecting the vehicle
        const characters = layer.find(".character");
        const attachments = layer.find(".attachment");
        const tokens = [...characters, ...attachments];
        for (let other of tokens) {
          const id = other.id();
          if (id in mapState.tokens) {
            const position = {
              x: mapState.tokens[id].x * mapWidth,
              y: mapState.tokens[id].y * mapHeight,
            };
            if (tokenIntersection.intersects(position)) {
              attachedTokens.push(other);
            }
          }
        }
      }

      if (tokenState.category === "character") {
        // Find all attachments and check whether they are close to the center of this token
        const attachments = layer.find(".attachment");
        for (let attachment of attachments) {
          const id = attachment.id();
          if (id in mapState.tokens) {
            const position = {
              x: mapState.tokens[id].x * mapWidth,
              y: mapState.tokens[id].y * mapHeight,
            };
            const distance = Vector2.distance(tokenGroup.position(), position);
            if (distance < attachmentThreshold) {
              attachedTokens.push(attachment);
            }
          }
        }
      }
    }

    return attachedTokens;
  }, [
    attachmentThreshold,
    tokenHeight,
    tokenWidth,
    tokenState,
    tokenX,
    tokenY,
    mapState,
    mapWidth,
    mapHeight,
  ]);

  // Override transform active to always show this transformer when using it
  const [overrideTransformActive, setOverrideTransformActive] = useState(false);

  function handleTransformStart(
    event: Konva.KonvaEventObject<Event>,
    attachments: Konva.Node[]
  ) {
    setOverrideTransformActive(true);
    onTokenTransformStart(event, attachments);
    onTokenMenuClose();
  }

  function handleTransformEnd(
    event: Konva.KonvaEventObject<Event>,
    attachments: Konva.Node[]
  ) {
    const transformer = event.currentTarget as Konva.Transformer;
    const nodes = [...transformer.nodes(), ...attachments];
    const tokenChanges: Record<string, Partial<TokenState>> = {};
    for (let node of nodes) {
      const id = node.id();
      if (id in mapState.tokens) {
        const sizeChange = node.scaleX();
        const rotation = node.rotation();
        const xChange = node.x() / mapWidth;
        const yChange = node.y() / mapHeight;
        tokenChanges[id] = {
          size: mapState.tokens[id].size * sizeChange,
          rotation: rotation,
          x: mapState.tokens[id].x + xChange,
          y: mapState.tokens[id].y + yChange,
        };
      }
      node.scaleX(1);
      node.scaleY(1);
      node.x(0);
      node.y(0);
    }

    onTokenStateChange(tokenChanges);
    if (transformRootRef.current) {
      onTokenMenuOpen(tokenState.id, transformRootRef.current, false);
    }
    setOverrideTransformActive(false);
    onTokenTransformEnd(event, attachments);
  }

  const transformerActive = useMemo(
    () => (!tokenState.locked && selected) || overrideTransformActive,
    [tokenState, selected, overrideTransformActive]
  );

  const transformerAttachments = useMemo(() => {
    if (transformerActive) {
      // Find attached transform roots
      return getAttachedTokens().map((node) =>
        (node as Konva.Group).findOne(".transform-root")
      );
    } else {
      return [];
    }
  }, [getAttachedTokens, transformerActive]);

  // When a token is hidden if you aren't the map owner hide it completely
  if (map && !tokenState.visible && map.owner !== userId) {
    return null;
  }

  // Token name is used by on click to find whether a token is a vehicle or prop
  let tokenName = "";
  if (tokenState) {
    tokenName = tokenState.category;
  }
  if (tokenState && tokenState.locked) {
    tokenName = tokenName + "-locked";
  }

  return (
    <>
      {/* react-spring's Konva prop inference exceeds TypeScript 5's depth limit */}
      {(() => {
        const AnimatedGroup = animated.Group as any;
        return (
          <AnimatedGroup
            {...(props as any)}
            width={tokenWidth}
            height={tokenHeight}
            draggable={draggable}
            onMouseDown={handlePointerDown}
            onMouseUp={handlePointerUp}
            onMouseEnter={handlePointerEnter}
            onMouseLeave={handlePointerLeave}
            onTouchStart={handlePointerDown}
            onTouchEnd={handlePointerUp}
            onClick={handleClick}
            onTap={handleClick}
            onContextMenu={handleContextMenu}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            opacity={tokenState.visible ? tokenOpacity : 0.5}
            name={tokenName}
            id={tokenState.id}
          >
            <Group
              ref={transformRootRef}
              id={tokenState.id}
              name="transform-root"
              rotation={tokenState.rotation}
              offsetX={tokenWidth / 2}
              offsetY={tokenHeight / 2}
            >
              <Group width={tokenWidth} height={tokenHeight} x={0} y={0}>
                <TokenOutline
                  outline={getScaledOutline(tokenState, tokenWidth, tokenHeight)}
                  hidden={!!tokenImage}
                  // Disable hit detection for attachments
                  hitFunc={
                    tokenState.category === "attachment" ? () => {} : undefined
                  }
                />
              </Group>
              <KonvaImage
                width={tokenWidth}
                height={tokenHeight}
                x={0}
                y={0}
                image={tokenImage}
                hitFunc={() => {}}
              />
              {/* Pedido do usuário (2026-10-12, quinta rodada): a borda
                  de destaque (seleção e turno ativo) precisa girar JUNTO
                  com o token — antes ficava no Group de fora, que não
                  carrega `rotation`, então um token com outline não
                  circular (rect/path) mostrava a borda sempre na
                  orientação original enquanto a arte visivelmente virava.
                  Movida para DENTRO deste Group (que já tem
                  rotation={tokenState.rotation} e o MESMO offsetX/Y, logo
                  o mesmo sistema de coordenadas 0..tokenWidth/Height que
                  TokenOutline usa acima) — resolve o giro sem duplicar
                  nenhuma conta. TokenStatus/TokenAttachment/TokenLabel
                  abaixo continuam no Group SEM rotação de propósito (nome
                  e ícones de status devem ficar sempre eretos,
                  independente de para onde o token está virado). */}
              {selected ? (
                <TokenHighlightOutline
                  width={tokenWidth}
                  height={tokenHeight}
                  color={theme.colors.secondary}
                  strokeWidth={Math.max(2, tokenWidth * 0.02)}
                />
              ) : null}
              {isActiveTurn ? (
                <TokenHighlightOutline
                  width={tokenWidth}
                  height={tokenHeight}
                  color={theme.colors.primary}
                  strokeWidth={Math.max(2.5, tokenWidth * 0.025)}
                  glowBlur={tokenWidth * 0.2}
                />
              ) : null}
            </Group>
            {!transforming ? (
              <Group offsetX={tokenWidth / 2} offsetY={tokenHeight / 2}>
                {tokenState.statuses?.length > 0 ? (
                  <TokenStatus
                    tokenState={tokenState}
                    width={tokenWidth}
                    height={tokenHeight}
                  />
                ) : null}
                {tokenState.category === "attachment" ? (
                  <Group offsetX={-tokenWidth / 2} offsetY={-tokenHeight / 2}>
                    <Group rotation={tokenState.rotation}>
                      <TokenAttachment
                        tokenHeight={tokenHeight}
                        dragging={dragging}
                        highlight={attachmentOverCharacter}
                        radius={attachmentThreshold * 2}
                      />
                    </Group>
                  </Group>
                ) : null}
                {tokenState.label && (isHovered || selected) ? (
                  <TokenLabel
                    label={tokenState.label}
                    size={tokenState.size}
                    visible={tokenState.visible}
                    width={tokenWidth}
                    height={tokenHeight}
                  />
                ) : null}
              </Group>
            ) : null}
          </AnimatedGroup>
        );
      })()}
      <Transformer
        active={transformerActive}
        nodes={
          transformRootRef.current
            ? [transformRootRef.current as Konva.Node]
            : []
        }
        attachments={transformerAttachments}
        onTransformEnd={handleTransformEnd}
        onTransformStart={handleTransformStart}
        gridScale={map.grid.measurement.scale}
      />
    </>
  );
}

export default Token;
