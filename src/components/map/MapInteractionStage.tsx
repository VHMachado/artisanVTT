import React, { useRef, useEffect, useState, useLayoutEffect } from "react";
import { Box } from "theme-ui";
import ReactResizeDetector from "react-resize-detector";
import { Stage, Layer, Image, Group, Rect } from "react-konva";
import Konva from "konva";

import useMapImage from "../../hooks/useMapImage";
import usePreventOverscroll from "../../hooks/usePreventOverscroll";
import useStageInteraction from "../../hooks/useStageInteraction";
import useImageCenter from "../../hooks/useImageCenter";
import usePreventContextMenu from "../../hooks/usePreventContextMenu";

import { getGridMaxZoom } from "../../helpers/grid";
import KonvaBridge from "../../helpers/KonvaBridge";

import { useArtisanStore } from "../../state/artisanStore";

import {
  MapInteractionEmitter,
  MapInteractionProvider,
} from "../../contexts/MapInteractionContext";
import { useMapStage } from "../../contexts/MapStageContext";
import { GridProvider } from "../../contexts/GridContext";
import { useKeyboard } from "../../contexts/KeyboardContext";

import shortcuts from "../../shortcuts";
import { Map } from "../../types/Map";
import { MapState } from "../../types/MapState";
import {
  AssignableMouseTool,
  MouseButtonBindings,
  MouseButtonToolId,
  toolForDragButtons,
  toolForKonvaButton,
} from "../../helpers/mouseBindings";

type LeftButtonToolChangeEventHandler = (tool: MouseButtonToolId) => void;
type ToolUseEventHandler = (tool: AssignableMouseTool) => void;

type MapInteractionProps = {
  map: Map | null;
  mapState: MapState | null;
  children?: React.ReactNode;
  controls: React.ReactNode;
  bindings: MouseButtonBindings;
  onLeftButtonToolChange: LeftButtonToolChangeEventHandler;
  onToolUse: ToolUseEventHandler;
  /**
   * Rendered inside the stage providers but outside the Konva layer, for
   * things that need the stage transform but draw nothing.
   */
  stageEffects?: React.ReactNode;
};

function MapInteraction({
  map,
  mapState,
  children,
  controls,
  bindings,
  onLeftButtonToolChange,
  onToolUse,
  stageEffects,
}: MapInteractionProps) {
  const [mapImage, mapImageStatus] = useMapImage(map);

  const [mapLoaded, setMapLoaded] = useState(false);
  useEffect(() => {
    if (!map || !mapState || mapState.mapId !== map.id) {
      setMapLoaded(false);
    } else if (mapImageStatus === "loaded") {
      setMapLoaded(true);
    }
  }, [mapImageStatus, map, mapState]);

  const stageWidth = useArtisanStore((state) => state.stageWidth);
  const stageHeight = useArtisanStore((state) => state.stageHeight);
  const stageScale = useArtisanStore((state) => state.stageScale);
  const preventMapInteraction = useArtisanStore(
    (state) => state.preventMapInteraction
  );
  const setViewportSize = useArtisanStore((state) => state.setViewportSize);
  const setStageScale = useArtisanStore((state) => state.setStageScale);
  const setPreventMapInteraction = useArtisanStore(
    (state) => state.setPreventMapInteraction
  );
  const setMapSize = useArtisanStore((state) => state.setMapSize);

  // Avoid state udpates when panning the map by using a ref and updating the konva element directly
  const stageTranslateRef = useRef({ x: 0, y: 0 });
  const mapStageRef = useMapStage();
  const mapLayerRef = useRef<Konva.Layer>(null);
  const mapImageRef = useRef<Konva.Image>(null);

  function handleResize(width?: number, height?: number) {
    if (width && height && width > 0 && height > 0) {
      setViewportSize(width, height);
    }
  }

  const containerRef = useRef<HTMLDivElement>(null);
  usePreventOverscroll(containerRef);
  usePreventContextMenu(containerRef);

  const [mapWidth, mapHeight] = useImageCenter(map, stageWidth, stageHeight, {
    stageRef: mapStageRef,
    imageLayerRef: mapLayerRef,
    containerRef,
    stageTranslateRef,
    setStageScale,
  });

  useLayoutEffect(() => {
    setMapSize(mapWidth, mapHeight);
  }, [mapHeight, mapWidth, setMapSize]);

  const previousLeftButtonToolRef = useRef(bindings.left);
  const [currentMouseButtons, setCurentMouseButtons] = useState(0);

  const [interactionEmitter] = useState(new MapInteractionEmitter());

  useStageInteraction(
    mapStageRef,
    stageScale,
    setStageScale,
    stageTranslateRef,
    mapLayerRef,
    getGridMaxZoom(map?.grid),
    bindings,
    preventMapInteraction,
    {
      onDrag: (props) => {
        const { first, last, buttons } = props;
        if (buttons !== currentMouseButtons) {
          setCurentMouseButtons(buttons);
        }
        // Só troca a faixa de configurações quando
        // ALGUM botão está pressionado (`buttons > 0`) — antes disto, o
        // evento de SOLTURA (`buttons` cai para 0) caía no mesmo
        // `toolForDragButtons`, que trata 0 como o botão esquerdo
        // (mesma convenção de touch), revertendo a faixa de volta para
        // a ferramenta do botão esquerdo no instante em que o botão
        // direito era liberado — exatamente o "as opções somem ao
        // soltar" relatado pelo usuário. Um clique único (sem arrasto)
        // já dispara "first" no mousedown via react-use-gesture, então
        // continua trocando a faixa imediatamente ao clicar.
        if (buttons > 0) {
          const activeTool = toolForDragButtons(buttons, bindings);
          if (activeTool && activeTool !== "none") {
            onToolUse(activeTool);
          }
        }
        if (first) {
          interactionEmitter.emit("dragStart", props);
        } else if (last) {
          interactionEmitter.emit("dragEnd", props);
        } else {
          interactionEmitter.emit("drag", props);
        }
      },
    }
  );

  function handleKeyDown(event: KeyboardEvent) {
    // Espaço aplica Mover temporariamente SOMENTE ao binding esquerdo;
    // o direito continua disponível para a ferramenta escolhida. Pinça é
    // deliberadamente ausente aqui: ela só faz zoom em useStageInteraction.
    if (shortcuts.move(event) && bindings.left === "move") {
      event.preventDefault();
    }
    if (map && shortcuts.move(event) && bindings.left !== "move") {
      event.preventDefault();
      previousLeftButtonToolRef.current = bindings.left;
      onLeftButtonToolChange("move");
    }
    if (!event.repeat && shortcuts.move(event) && bindings.left === "move") {
      previousLeftButtonToolRef.current = "move";
    }
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (shortcuts.move(event) && bindings.left === "move") {
      onLeftButtonToolChange(previousLeftButtonToolRef.current);
    }
  }

  useKeyboard(handleKeyDown, handleKeyUp);

  // O usuário quer a faixa de configurações
  // aparecendo com um ÚNICO clique, não só ao arrastar/segurar — o
  // `onDrag` acima só dispara depois que `react-use-gesture` decide que
  // o gesto é um arraste (delay de 300ms, ver useStageInteraction), que
  // é perceptível como "precisa segurar o botão". Um listener nativo de
  // `pointerdown` direto no container dispara no instante do toque, sem
  // esperar esse delay — mas o container também envolve `controls` (o
  // próprio rail/dock), então sem filtrar pelo CANVAS especificamente
  // clicar em QUALQUER botão da UI (tela cheia, seletor de mapa) também
  // trocaria a faixa de configurações para o binding atual. Mesmo
  // critério de "é realmente o mapa" que onWheelStart/onDragStart já
  // usam em useStageInteraction.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      const layer = mapLayerRef.current;
      if (!layer || event.target !== layer.getCanvas()._canvas) {
        return;
      }
      const activeTool = toolForKonvaButton(event.button, bindings);
      if (activeTool && activeTool !== "none") {
        onToolUse(activeTool);
      }
    }
    element.addEventListener("pointerdown", handlePointerDown);
    return () => {
      element.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [bindings, onToolUse]);

  function getCursorForTool(tool: MouseButtonBindings[keyof MouseButtonBindings] | undefined) {
    if (currentMouseButtons === 2) {
      return tool === "none" ? "default" : "crosshair";
    } else if (currentMouseButtons > 2) {
      return "move";
    }
    switch (tool) {
      case "move":
        return "move";
      case "fog":
      case "measure":
      case "pointer":
      case "select":
        return "crosshair";
      default:
        return "default";
    }
  }

  const currentTool =
    toolForDragButtons(currentMouseButtons, bindings) ?? bindings.left;

  const mapInteraction = {
    stageScale,
    setStageScale,
    stageWidth,
    stageHeight,
    setPreventMapInteraction,
    mapWidth,
    mapHeight,
    interactionEmitter,
  };

  return (
    <MapInteractionProvider value={mapInteraction}>
      <GridProvider
        grid={map?.grid || null}
        width={mapWidth}
        height={mapHeight}
      >
        <Box
          sx={{
            position: "relative",
            cursor: getCursorForTool(currentTool),
            touchAction: "none",
            outline: "none",
            width: "100%",
            height: "100%",
            // A camada de dados (DiceRollLayer, dentro de
            // `controls`) aplica um `transform: translate(...) scale(...)`
            // no seu próprio wrapper para seguir o pan/zoom do mapa — sem
            // `overflow: hidden` aqui, essa transform conta para a área de
            // rolagem (scrollable overflow) do documento inteiro em vez de
            // ficar confinada a este contêiner, abrindo barras de rolagem
            // na janela do jogo inteira que arrastavam a tela toda.
            overflow: "hidden",
          }}
          ref={containerRef}
          className="map"
        >
          <ReactResizeDetector
            handleWidth
            handleHeight
            onResize={handleResize}
            targetRef={containerRef}
          >
            <KonvaBridge
              stageRender={(children) => (
                <Stage
                  // @ts-ignore
                  width={stageWidth}
                  height={stageHeight}
                  scale={{ x: stageScale, y: stageScale }}
                  ref={mapStageRef}
                >
                  {children}
                </Stage>
              )}
            >
              <Layer ref={mapLayerRef}>
                {mapLoaded && !mapImage && (
                  <Rect width={mapWidth} height={mapHeight} fill="#101217" />
                )}
                <Image
                  image={(mapLoaded && mapImage) || undefined}
                  width={mapWidth}
                  height={mapHeight}
                  id="mapImage"
                  ref={mapImageRef}
                />
                {mapLoaded && children}
                <Group id="portal" />
              </Layer>
            </KonvaBridge>
          </ReactResizeDetector>
          {controls}
        </Box>
        {stageEffects}
      </GridProvider>
    </MapInteractionProvider>
  );
}

export default MapInteraction;
