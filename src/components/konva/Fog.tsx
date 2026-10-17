import Konva from "konva";
import { Line } from "react-konva";

import Vector2 from "../../helpers/Vector2";
import { scaleAndFlattenPoints } from "../../helpers/konva";
import { Fog as FogType } from "../../types/Fog";
import {
  useMapHeight,
  useMapWidth,
} from "../../contexts/MapInteractionContext";

type FogProps = {
  fog: FogType;
} & Konva.LineConfig;

/**
 * Motor de fog of war próprio.
 */

/**
 * Konva's `Line` built-in `closed` fill não sabe desenhar um polígono COM
 * buracos (`fog.data.holes`) — ele preenche o anel externo sozinho. Um
 * `sceneFunc` próprio contorna isso: desenha o anel externo e cada buraco
 * no MESMO `Path2D` do canvas e deixa a regra de preenchimento
 * "even-odd"/nonzero do canvas decidir onde fica vazio (a mesma técnica
 * que `components/konva/DarknessOverlay.tsx` já usa para seus furos de
 * luz — "holes should be wound in the opposite direction as the
 * containing points array", comentário que já estava aqui e continua
 * valendo: um buraco com winding oposto ao do anel externo soma zero no
 * nonzero-fill e fica sem tinta).
 */
function traceRing(context: Konva.Context, ring: number[]) {
  if (ring.length < 2) {
    return;
  }
  context.moveTo(ring[0], ring[1]);
  for (let i = 2; i < ring.length; i += 2) {
    context.lineTo(ring[i], ring[i + 1]);
  }
  context.closePath();
}

function buildFogSceneFunc(holes: number[][]) {
  return function sceneFunc(context: Konva.Context, shape: Konva.Line) {
    const ownPoints = shape.points();
    if (!ownPoints.length) {
      return;
    }
    context.beginPath();
    traceRing(context, ownPoints);
    for (const hole of holes) {
      traceRing(context, hole);
    }
    context.fillStrokeShape(shape);
  };
}

/**
 * Nenhum chamador deste componente passa `tension`/`bezier`
 * (`components/tools/FogTool.tsx` só usa pontos retos — confirmado por
 * grep antes de reescrever), então este sceneFunc não reimplementa a
 * interpolação de curva do Konva.Line original: cada vértice vira
 * simplesmente uma reta até o próximo.
 */
export default function Fog(allProps: FogProps) {
  const { fog, opacity, ...props } = allProps;
  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const mapSize = new Vector2(mapWidth, mapHeight);

  const points = scaleAndFlattenPoints(fog.data.points, mapSize);
  const holes = fog.data.holes.map((hole) =>
    scaleAndFlattenPoints(hole, mapSize)
  );
  const sceneFunc = buildFogSceneFunc(holes);

  return renderFogOutline(points, sceneFunc, props);
}

function renderFogOutline(
  points: number[],
  sceneFunc: (context: Konva.Context, shape: Konva.Line) => void,
  lineProps: Omit<FogProps, "fog" | "opacity">
) {
  return (
    <Line
      points={points}
      closed
      lineCap="round"
      lineJoin="round"
      {...lineProps}
      sceneFunc={sceneFunc as any}
    />
  );
}
