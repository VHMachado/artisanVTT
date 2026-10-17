import shortid from "shortid";
import polygonClipping, {
  Geom,
  MultiPolygon,
  Polygon,
  Ring,
} from "polygon-clipping";

import Vector2, { BoundingBox } from "./Vector2";
import Size from "./Size";
import { getNearestCellCoordinates, getCellLocation } from "./grid";

import { Fog, FogState } from "../types/Fog";
import { Grid } from "../types/Grid";

/**
 * Motor de fog of war próprio.
 *
 * Toda a geometria do fog (interseção/diferença de polígonos, merge de
 * formas sobrepostas, caixas delimitadoras para os guias de desenho e o
 * cálculo dos próprios guias) vivia espalhada em `helpers/actions.ts` e em
 * uma fatia de `helpers/drawing.ts`. Reunir num único módulo deixa claro
 * que é um subsistema — o fog é o único consumidor de cada função daqui
 * (confirmado por grep antes de mover: nada em `SelectTool`/
 * `MeasureTool` importa nenhuma destas).
 *
 * Comportamento-alvo idêntico ao da implementação anterior:
 * cortar/somar fog com `polygon-clipping`, multilayer, preview do Mestre e
 * os guias de alinhamento ao arrastar um polígono/retângulo — só a
 * implementação por trás é nova.
 */

/** Um anel (`points` ou um `hole`) convertido para o formato de
 * coordenadas que `polygon-clipping` espera: array de pares `[x, y]`. */
function ringToPairs(ring: Vector2[]): Ring {
  return ring.map(({ x, y }) => [x, y]);
}

/** O inverso de `ringToPairs` — usado para ler de volta o resultado de
 * uma operação booleana. */
function pairsToRing(ring: Ring): Vector2[] {
  return ring.map(([x, y]) => ({ x, y }));
}

/** Converte um `Fog` para a geometria que `polygon-clipping` opera sobre:
 * um único polígono (anel externo + buracos). */
export function fogToGeometry(fog: Fog): Geom {
  const shell = ringToPairs(fog.data.points);
  const holes: Polygon = fog.data.holes.map(ringToPairs);
  return [[shell, ...holes]];
}

/** Um `MultiPolygon` (o resultado de uma operação booleana) devolvido ao
 * formato `FogState`, atribuindo um novo id a cada polígono resultante e
 * copiando todo o resto do fog original (cor, strokeWidth, visibilidade
 * — exceto quando `overrides` pede outra coisa, usado pela interseção
 * abaixo para nascer invisível). */
function multiPolygonToFogState(
  template: Fog,
  multiPolygon: MultiPolygon,
  into: FogState,
  overrides: Partial<Fog> = {}
): void {
  for (const polygon of multiPolygon) {
    const [shell, ...holes] = polygon;
    const id = shortid.generate();
    into[id] = {
      ...template,
      ...overrides,
      id,
      data: {
        points: pairsToRing(shell),
        holes: holes.map(pairsToRing),
      },
    };
  }
}

/** A parte de `fog` que sobra depois de remover `difference` — usada
 * tanto por "apagar fog" (`SubtractFogAction`) quanto pela metade
 * "o que não foi cortado" de `CutFogAction`. */
export function addPolygonDifferenceToFog(
  fog: Fog,
  difference: MultiPolygon,
  into: FogState
): void {
  multiPolygonToFogState(fog, difference, into);
}

/** A parte de `fog` que o corte atingiu — nasce invisível (é o que o
 * Jogador passa a ver), mesmo acordo que o fog original sempre teve. */
export function addPolygonIntersectionToFog(
  fog: Fog,
  intersection: MultiPolygon,
  into: FogState
): void {
  multiPolygonToFogState(fog, intersection, into, { visible: false });
}

/**
 * Funde todas as formas de fog visíveis (ou todas, se `ignoreHidden` for
 * falso) numa só malha — é o que o Jogador vê: várias formas desenhadas
 * separadamente pelo Mestre não devem denunciar suas bordas internas.
 */
export function mergeFogShapes(
  shapes: Fog[],
  ignoreHidden: boolean = true
): Fog[] {
  const visible = shapes.filter((shape) => !ignoreHidden || shape.visible);
  if (visible.length === 0) {
    return ignoreHidden ? [] : shapes;
  }

  const geometries = visible.map(fogToGeometry);
  try {
    const union = polygonClipping.union(geometries[0], ...geometries.slice(1));
    const merged: FogState = {};
    // Usa o primeiro fog visível como molde de cor/strokeWidth/etc — a
    // malha fundida não tem uma identidade própria, herda a do grupo.
    multiPolygonToFogState(visible[0], union, merged, {});
    return Object.values(merged).map((shape, index) => ({
      ...shape,
      id: `merged-${index}`,
    }));
  } catch {
    console.error("Fog of war: falha ao unir as formas visíveis");
    return shapes;
  }
}

/**
 * Caixas delimitadoras de cada forma de fog, usadas para alinhar o
 * desenho de uma nova forma às bordas das já existentes. `maxPoints`
 * limita o custo: formas com muitos vértices (traços de pincel livres)
 * não valem a pena oferecer como guia.
 */
export function getFogShapesBoundingBoxes(
  shapes: Fog[],
  maxPoints = 0
): BoundingBox[] {
  const boxes: BoundingBox[] = [];
  for (const shape of shapes) {
    if (maxPoints > 0 && shape.data.points.length > maxPoints) {
      continue;
    }
    boxes.push(Vector2.getBoundingBox(shape.data.points));
  }
  return boxes;
}

/** Uma linha de alinhamento candidata enquanto o Mestre arrasta um
 * polígono/retângulo de fog: onde ela fica e o quão perto o cursor
 * precisa estar para "colar" nela. */
export type Guide = {
  start: Vector2;
  end: Vector2;
  orientation: "horizontal" | "vertical";
  distance: number;
};

/** As três retas verticais e três horizontais de uma caixa delimitadora
 * (as duas bordas e o centro, em cada eixo) — os candidatos a guia que
 * `getGuidesFromBoundingBoxes` filtra por proximidade. */
function edgesOf(bounds: BoundingBox) {
  const vertical = [bounds.min.x, bounds.center.x, bounds.max.x].map((x) => ({
    start: { x, y: bounds.min.y },
    end: { x, y: bounds.max.y },
  }));
  const horizontal = [bounds.min.y, bounds.center.y, bounds.max.y].map(
    (y) => ({
      start: { x: bounds.min.x, y },
      end: { x: bounds.max.x, y },
    })
  );
  return { vertical, horizontal };
}

/**
 * Guias próximos o bastante do cursor (`brushPosition`, normalizado) para
 * valer a pena mostrar/colar, a partir das caixas delimitadoras de outras
 * formas (ou da borda do mapa). `gridCellSize` normaliza a sensibilidade
 * ao tamanho da célula, não a pixels absolutos — um mapa com grid maior
 * não deveria colar mais fácil só por isso.
 */
export function getGuidesFromBoundingBoxes(
  brushPosition: Vector2,
  boundingBoxes: BoundingBox[],
  gridCellSize: Vector2,
  snappingSensitivity: number
): Guide[] {
  const guides: Guide[] = [];
  for (const bounds of boundingBoxes) {
    const { vertical, horizontal } = edgesOf(bounds);
    for (const edge of vertical) {
      const distance = Math.abs(brushPosition.x - edge.start.x);
      if (distance / gridCellSize.x < snappingSensitivity) {
        guides.push({ ...edge, distance, orientation: "vertical" });
      }
    }
    for (const edge of horizontal) {
      const distance = Math.abs(brushPosition.y - edge.start.y);
      if (distance / gridCellSize.y < snappingSensitivity) {
        guides.push({ ...edge, distance, orientation: "horizontal" });
      }
    }
  }
  return guides;
}

/**
 * O mesmo conceito de guia, mas derivado da célula de grid mais próxima
 * do cursor em vez da caixa de outra forma — permite colar um vértice de
 * fog exatamente na borda de uma célula. Sempre inclui a borda do mapa
 * inteiro (0..1) como guia adicional, já que a borda do mapa é, na
 * prática, a parede mais comum que o Mestre quer encostar o fog.
 */
export function getGuidesFromGridCell(
  brushPosition: Vector2,
  grid: Grid,
  gridCellSize: Size,
  gridOffset: Vector2,
  gridCellOffset: Vector2,
  snappingSensitivity: number,
  mapSize: Vector2
): Guide[] {
  const mapBounds = Vector2.getBoundingBox([
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ]);

  const localPosition = Vector2.subtract(
    Vector2.subtract(brushPosition, gridOffset),
    gridCellOffset
  );
  const cellCoords = getNearestCellCoordinates(
    grid,
    localPosition.x,
    localPosition.y,
    gridCellSize
  );
  const cellCenterPixels = Vector2.add(
    Vector2.add(getCellLocation(grid, cellCoords.x, cellCoords.y, gridCellSize), gridOffset),
    gridCellOffset
  );
  const cellCenter = Vector2.divide(cellCenterPixels, mapSize);
  const cellSizeNormalized = Vector2.divide(gridCellSize, mapSize);

  const cellBounds = Vector2.getBoundingBox([
    {
      x: cellCenter.x - cellSizeNormalized.x / 2,
      y: cellCenter.y - cellSizeNormalized.y / 2,
    },
    {
      x: cellCenter.x + cellSizeNormalized.x / 2,
      y: cellCenter.y + cellSizeNormalized.y / 2,
    },
  ]);

  return getGuidesFromBoundingBoxes(
    Vector2.divide(brushPosition, mapSize),
    [mapBounds, cellBounds],
    cellSizeNormalized,
    snappingSensitivity
  );
}

/**
 * De todos os guias candidatos, mantém só o melhor vertical e o melhor
 * horizontal (os mais próximos do cursor), e estica cada um até encontrar
 * o outro — um guia sozinho vira uma linha reta inteira na direção dele;
 * os dois juntos formam a cruz que marca o ponto de encontro exato.
 */
export function findBestGuides(
  brushPosition: Vector2,
  guides: Guide[]
): Guide[] {
  const closest = (orientation: Guide["orientation"]) =>
    guides
      .filter((guide) => guide.orientation === orientation)
      .sort((a, b) => a.distance - b.distance)[0];

  const vertical = closest("vertical");
  const horizontal = closest("horizontal");

  if (vertical && !horizontal) {
    vertical.start.y = Math.min(vertical.start.y, brushPosition.y);
    vertical.end.y = Math.max(vertical.end.y, brushPosition.y);
    return [vertical];
  }
  if (horizontal && !vertical) {
    horizontal.start.x = Math.min(horizontal.start.x, brushPosition.x);
    horizontal.end.x = Math.max(horizontal.end.x, brushPosition.x);
    return [horizontal];
  }
  if (horizontal && vertical) {
    vertical.start.y = Math.min(vertical.start.y, horizontal.start.y);
    vertical.end.y = Math.max(vertical.end.y, horizontal.start.y);
    horizontal.start.x = Math.min(horizontal.start.x, vertical.start.x);
    horizontal.end.x = Math.max(horizontal.end.x, vertical.start.x);
    return [horizontal, vertical];
  }
  return [];
}
