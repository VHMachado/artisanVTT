import { useState } from "react";
import { Box } from "theme-ui";
import { useToasts } from "react-toast-notifications";

import MapControls from "./MapControls";
import MapDock from "./MapDock";
import MapBackButton from "./MapBackButton";
import MapCastButton from "./MapCastButton";
import MapInteraction from "./MapInteraction";
import MapGrid from "./MapGrid";
import DarknessOverlay from "../konva/DarknessOverlay";

import FogTool from "../tools/FogTool";
import MeasureTool from "../tools/MeasureTool";
import NetworkedMapPointer from "../../network/NetworkedMapPointer";
import NetworkedMapCamera from "../../network/NetworkedMapCamera";

import { useSettings } from "../../contexts/SettingsContext";
import { useUserId } from "../../contexts/UserIdContext";
import { useIsSpectator } from "../../contexts/SpectatorContext";
import Action from "../../actions/Action";
import {
  AddStatesAction,
  CutFogAction,
  EditStatesAction,
  RemoveStatesAction,
} from "../../actions";

import Session from "../../network/Session";

import { Fog, FogState } from "../../types/Fog";
import { Map as MapType } from "../../types/Map";
import { MapState, MapDarkness } from "../../types/MapState";
import { Settings } from "../../types/Settings";
import {
  AssignableMouseTool,
  MouseButtonBindings,
  MouseButtonToolId,
} from "../../helpers/mouseBindings";
import {
  MapChangeEventHandler,
  MapResetEventHandler,
  TokenStateRemoveHandler,
  TokenStateChangeEventHandler,
  SelectionItemsChangeEventHandler,
  SelectionItemsRemoveEventHandler,
  SelectionItemsCreateEventHandler,
  TokensStateCreateHandler,
} from "../../types/Events";

import useMapTokens from "../../hooks/useMapTokens";
import { MapActions } from "../../hooks/useMapActions";
import useMapSelection from "../../hooks/useMapSelection";
import useInitiativeTracker from "../../hooks/useInitiativeTracker";
import { activeEntryTokenId } from "../../helpers/initiative";

type MapProps = {
  map: MapType | null;
  mapState: MapState | null;
  mapActions: MapActions;
  onMapTokenStateChange: TokenStateChangeEventHandler;
  onMapTokenStateRemove: TokenStateRemoveHandler;
  onMapTokensStateCreate: TokensStateCreateHandler;
  onSelectionItemsChange: SelectionItemsChangeEventHandler;
  onSelectionItemsRemove: SelectionItemsRemoveEventHandler;
  onSelectionItemsCreate: SelectionItemsCreateEventHandler;
  onMapChange: MapChangeEventHandler;
  onMapReset: MapResetEventHandler;
  onFogDraw: (action: Action<FogState>) => void;
  /** Toggles/adjusts the map's darkness layer. Lives in
   * mapState, so this goes through the versioned live channel rather
   * than the map library — see NetworkedMapAndTokens. */
  onMapDarknessChange: (darkness: MapDarkness) => void;
  allowMapChange: boolean;
  session: Session;
  onUndo: () => void;
  onRedo: () => void;
  /** The Mesa being played — threaded through to useMapTokens for a
   * monster token's right-click menu. */
  tableId: string;
};

function Map({
  map,
  mapState,
  mapActions,
  onMapTokenStateChange,
  onMapTokenStateRemove,
  onMapTokensStateCreate,
  onSelectionItemsChange,
  onSelectionItemsRemove,
  onSelectionItemsCreate,
  onMapChange,
  onMapReset,
  onFogDraw,
  onMapDarknessChange,
  allowMapChange,
  session,
  onUndo,
  onRedo,
  tableId,
}: MapProps) {
  const { addToast } = useToasts();

  const userId = useUserId();
  const isSpectator = useIsSpectator();

  const { settings, setSettings } = useSettings();
  const bindings: MouseButtonBindings = {
    left: settings.map.leftButtonTool || "move",
    right: settings.map.rightButtonTool || "none",
  };
  const [settingsToolId, setSettingsToolId] = useState<AssignableMouseTool>(
    bindings.left === "none" ? "move" : bindings.left
  );

  // The map owner shares their view, everyone else follows it. The
  // Espectador window always follows too — see
  // helpers/spectator.ts: its own WebView2 profile gives it a different
  // local userId than the Mestre's window, so map.owner === userId is
  // already false there, but isSpectator is kept explicit below (camera
  // sharing, fog/drawing editability) rather than relying only on that
  // incidental id mismatch.
  const isMapOwner = !!map && map.owner === userId && !isSpectator;

  function handleToolSettingChange(change: Partial<Settings>) {
    setSettings((prevSettings) => ({
      ...prevSettings,
      ...change,
    }));
  }

  function handleBindingsChange(nextBindings: MouseButtonBindings) {
    setSettings((prevSettings) => ({
      ...prevSettings,
      map: {
        ...prevSettings.map,
        leftButtonTool: nextBindings.left,
        rightButtonTool: nextBindings.right,
      },
    }));
  }

  function handleLeftButtonToolChange(tool: MouseButtonToolId) {
    handleBindingsChange({ ...bindings, left: tool });
    if (tool !== "none") {
      setSettingsToolId(tool);
    }
  }

  const fogShapes = Object.values(mapState?.fogs || {});

  function handleFogShapesAdd(shapes: Fog[]) {
    onFogDraw(new AddStatesAction(shapes));
  }

  function handleFogShapesCut(shapes: Fog[]) {
    onFogDraw(new CutFogAction(shapes));
  }

  function handleFogShapesRemove(shapeIds: string[]) {
    onFogDraw(new RemoveStatesAction(shapeIds));
  }

  function handleFogShapesEdit(shapes: Partial<Fog>[]) {
    onFogDraw(new EditStatesAction(shapes));
  }

  const { selectionTool, selectionMenu, selectionDragOverlay, selection, onTokenShiftClick, onTokenClick, shiftSelectEnabled, clearSelection } =
    useMapSelection(
      map,
      mapState,
      onSelectionItemsChange,
      onSelectionItemsRemove,
      onSelectionItemsCreate,
      bindings,
      settings.select
    );

  // Pedido do usuário (2026-10-12, revisado 2026-10-26): toda seleção
  // JÁ RESOLVIDA num grupo de tokens — construída por shift+click OU
  // por uma marquee que terminou de arrastar e encontrou tokens — usa
  // o caminho de grupo do próprio Token.tsx (groupSelectedIds). Uma
  // marquee ainda EM ANDAMENTO (não resolvida) continua tendo seu
  // próprio arraste via a shape <Selection> (Selection.tsx); aplicar os
  // dois ao mesmo tempo moveria cada token duas vezes.
  const activeSelectionIds =
    selection?.resolved
      ? new Set(selection.items.map((item) => item.id))
      : new Set<string>();

  // Pedido do usuário (2026-10-12, quarta rodada, item 5): instanciado
  // AQUI (não mais dentro de MapDock.tsx) para que o indicador de
  // turno ativo no token (Token.tsx's `isActiveTurn`, logo abaixo)
  // alcance TODO cliente que renderiza este mapa — Mestre, Jogador e
  // Espectador — e não só a janela do Mestre, que é a única que
  // efetivamente renderiza a UI de edição do tracker (MapDock's
  // `isOwner`/MapDock(props) gate em SpectatorDiceLayer). O canal
  // "initiative" (useNetworkedState) já é rebroadcast a todos, então
  // ler aqui é seguro mesmo para clientes que nunca escrevem nele.
  const tracker = useInitiativeTracker(session, tableId);
  const activeTokenId = activeEntryTokenId(tracker.state);

  const { tokens, propTokens, tokenMenu, tokenMonsterMenu, tokenLightModal, monsterModals } =
    useMapTokens(
      map,
      mapState,
      onMapTokenStateChange,
      onMapTokenStateRemove,
      onMapTokensStateCreate,
      bindings,
      tableId,
      onTokenShiftClick,
      onTokenClick,
      activeSelectionIds,
      shiftSelectEnabled,
      activeTokenId
    );

  return (
    <Box sx={{ flexGrow: 1 }}>
      <MapInteraction
        map={map}
        mapState={mapState}
        controls={
          <>
            <MapControls
              onMapChange={onMapChange}
              onMapReset={onMapReset}
              map={map}
              mapState={mapState}
              mapActions={mapActions}
              allowMapChange={allowMapChange}
              bindings={bindings}
              onBindingsChange={handleBindingsChange}
              settingsToolId={settingsToolId}
              onSettingsToolChange={setSettingsToolId}
              toolSettings={settings}
              onToolSettingChange={handleToolSettingChange}
              onUndo={onUndo}
              onRedo={onRedo}
              isMapOwner={isMapOwner}
              gameId={tableId}
              onMapDarknessChange={onMapDarknessChange}
            />
            {tokenMenu}
            {tokenMonsterMenu}
            {tokenLightModal}
            {monsterModals}
            {selectionMenu}
            {selectionDragOverlay}
            {/* O dock inferior (configurações, dados,
                iniciativa) e o botão de voltar vivem DENTRO de `controls`,
                não como irmãos do mapa em Game.tsx — é o que os posiciona
                contra a área do mapa (MapInteraction's `.map` box é o
                ancestral `position: relative`) e o que faz o dock
                desaparecer junto com o resto do chrome na janela de
                Espectador. */}
            <MapDock
              tableId={tableId}
              session={session}
              mapState={mapState}
              selectedTokenIds={selection?.items.map((item) => item.id) ?? []}
              onMapTokenStateChange={onMapTokenStateChange}
              onClearSelection={clearSelection}
              tracker={tracker}
            />
            {/* "Voltar para a Home" não é renderizado na janela de
                Espectador. Ela é uma segunda instância do app que o
                Mestre abre JÁ dentro de uma Mesa (helpers/spectator.ts),
                e routes/Home.tsx renavega para cá no mesmo instante —
                então o botão não leva a lugar nenhum. Ele só existia
                como caminho de volta para quem entrou pela Home. */}
            {!isSpectator && <MapBackButton />}
            <MapCastButton />
          </>
        }
        bindings={bindings}
        onLeftButtonToolChange={handleLeftButtonToolChange}
        onToolUse={setSettingsToolId}
        stageEffects={
          <NetworkedMapCamera
            session={session}
            // The camera-share toggle is gone — the Mestre's
            // view now ALWAYS broadcasts (there is nothing else in this
            // window's audience that "sharing" would matter to; a real
            // Jogador never auto-follows anymore, only the dedicated
            // Espectador window opened via the eye button does).
            broadcasting={isMapOwner}
            following={isSpectator}
          />
        }
      >
        {map && map.showGrid && <MapGrid map={map} />}
        {propTokens}
        {tokens}
        {/* The darkness sits between the tokens and the fog —
            tokens standing in an unlit area read as being in the dark
            (correct), while fog stays sovereign above it (also correct:
            fog is information about what's hidden, not lighting). */}
        {map && mapState && (
          <DarknessOverlay mapState={mapState} editable={isMapOwner} />
        )}
        <FogTool
          map={map}
          shapes={fogShapes}
          onShapesAdd={handleFogShapesAdd}
          onShapesCut={handleFogShapesCut}
          onShapesRemove={handleFogShapesRemove}
          onShapesEdit={handleFogShapesEdit}
          onShapeError={addToast}
          bindings={bindings}
          toolSettings={settings.fog}
          editable={
            !!(map?.owner === userId || mapState?.editFlags.includes("fog")) &&
            !isSpectator &&
            !settings.fog.preview
          }
        />
        <NetworkedMapPointer bindings={bindings} session={session} />
        <MeasureTool map={map} bindings={bindings} />
        {selectionTool}
      </MapInteraction>
    </Box>
  );
}

export default Map;
