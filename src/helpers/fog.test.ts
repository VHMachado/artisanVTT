import { describe, expect, test } from "vitest";

import {
  addPolygonDifferenceToFog,
  addPolygonIntersectionToFog,
  findBestGuides,
  fogToGeometry,
  getFogShapesBoundingBoxes,
  getGuidesFromBoundingBoxes,
  mergeFogShapes,
} from "./fog";

import type { Fog, FogState } from "../types/Fog";

/**
 * Motor de fog of war próprio. Equivalente, contra o código
 * novo, aos testes que `helpers/drawing.ts`/`helpers/actions.ts` nunca
 * tiveram (a implementação anterior não trazia suite para esta fatia) — aqui a
 * geometria passa a ser verificável por asserção, não só por inspeção
 * visual lado a lado.
 */

function square(
  x: number,
  y: number,
  size: number,
  overrides: Partial<Fog> = {}
): Fog {
  return {
    id: `f-${x}-${y}`,
    type: "fog",
    color: "black",
    strokeWidth: 0.5,
    visible: true,
    data: {
      points: [
        { x, y },
        { x: x + size, y },
        { x: x + size, y: y + size },
        { x, y: y + size },
      ],
      holes: [],
    },
    ...overrides,
  };
}

describe("fogToGeometry", () => {
  test("converte anel externo e buracos para o formato polygon-clipping", () => {
    const fog = square(0, 0, 10, {
      data: {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        holes: [
          [
            { x: 2, y: 2 },
            { x: 4, y: 2 },
            { x: 4, y: 4 },
            { x: 2, y: 4 },
          ],
        ],
      },
    });
    const geom = fogToGeometry(fog);
    expect(geom).toHaveLength(1);
    const [shell, hole] = geom[0];
    expect(shell).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(hole).toEqual([
      [2, 2],
      [4, 2],
      [4, 4],
      [2, 4],
    ]);
  });
});

describe("addPolygonDifferenceToFog / addPolygonIntersectionToFog", () => {
  test("difference preserva a identidade do fog original (menos id/data)", () => {
    const original = square(0, 0, 10, { visible: false, color: "red" });
    const into: FogState = {};
    addPolygonDifferenceToFog(
      original,
      [
        [
          [
            [0, 0],
            [5, 0],
            [5, 10],
            [0, 10],
          ],
        ],
      ],
      into
    );
    const results = Object.values(into);
    expect(results).toHaveLength(1);
    expect(results[0].visible).toBe(false);
    expect(results[0].color).toBe("red");
    expect(results[0].id).not.toBe(original.id);
  });

  test("intersection nasce sempre invisível, mesmo que o original fosse visível", () => {
    const original = square(0, 0, 10, { visible: true });
    const into: FogState = {};
    addPolygonIntersectionToFog(
      original,
      [
        [
          [
            [0, 0],
            [5, 0],
            [5, 10],
            [0, 10],
          ],
        ],
      ],
      into
    );
    const results = Object.values(into);
    expect(results).toHaveLength(1);
    expect(results[0].visible).toBe(false);
  });

  test("um MultiPolygon com N polígonos gera N fogs com ids distintos", () => {
    const original = square(0, 0, 10);
    const into: FogState = {};
    addPolygonDifferenceToFog(
      original,
      [
        [[[0, 0], [1, 0], [1, 1], [0, 1]]],
        [[[5, 5], [6, 5], [6, 6], [5, 6]]],
      ],
      into
    );
    const ids = Object.keys(into);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("mergeFogShapes", () => {
  test("funde duas formas sobrepostas numa só", () => {
    const a = square(0, 0, 10);
    const b = square(5, 0, 10);
    const merged = mergeFogShapes([a, b]);
    expect(merged).toHaveLength(1);
  });

  test("ignora formas invisíveis por padrão", () => {
    const visible = square(0, 0, 10);
    const hidden = square(20, 20, 10, { visible: false });
    const merged = mergeFogShapes([visible, hidden]);
    expect(merged).toHaveLength(1);
  });

  test("ignoreHidden=false mantém até formas invisíveis separadas", () => {
    const visible = square(0, 0, 10);
    const hidden = square(20, 20, 10, { visible: false });
    const merged = mergeFogShapes([visible, hidden], false);
    expect(merged).toHaveLength(2);
  });

  test("lista vazia devolve lista vazia", () => {
    expect(mergeFogShapes([])).toEqual([]);
  });

  test("formas sem sobreposição permanecem separadas", () => {
    const a = square(0, 0, 10);
    const b = square(100, 100, 10);
    const merged = mergeFogShapes([a, b]);
    expect(merged).toHaveLength(2);
  });
});

describe("getFogShapesBoundingBoxes", () => {
  test("uma caixa por forma, nas coordenadas certas", () => {
    const boxes = getFogShapesBoundingBoxes([square(0, 0, 10)]);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].min).toEqual({ x: 0, y: 0 });
    expect(boxes[0].max).toEqual({ x: 10, y: 10 });
  });

  test("maxPoints descarta formas com mais vértices que o limite", () => {
    const simple = square(0, 0, 10); // 4 pontos
    const complex: Fog = {
      ...square(50, 50, 10),
      data: {
        points: Array.from({ length: 10 }, (_, i) => ({ x: i, y: i })),
        holes: [],
      },
    };
    const boxes = getFogShapesBoundingBoxes([simple, complex], 5);
    expect(boxes).toHaveLength(1);
  });

  test("maxPoints=0 (padrão) não filtra nada", () => {
    const complex: Fog = {
      ...square(0, 0, 10),
      data: {
        points: Array.from({ length: 10 }, (_, i) => ({ x: i, y: i })),
        holes: [],
      },
    };
    expect(getFogShapesBoundingBoxes([complex])).toHaveLength(1);
  });
});

describe("getGuidesFromBoundingBoxes / findBestGuides", () => {
  test("cursor perto de uma borda produz um guia naquela orientação", () => {
    const box = getFogShapesBoundingBoxes([square(0, 0, 10)])[0];
    const guides = getGuidesFromBoundingBoxes(
      { x: 0.01, y: 5 },
      [box],
      { x: 10, y: 10 },
      0.5
    );
    expect(guides.some((g) => g.orientation === "vertical")).toBe(true);
  });

  test("cursor longe de qualquer borda não produz guia", () => {
    const box = getFogShapesBoundingBoxes([square(0, 0, 10)])[0];
    const guides = getGuidesFromBoundingBoxes(
      { x: 1000, y: 1000 },
      [box],
      { x: 10, y: 10 },
      0.1
    );
    expect(guides).toHaveLength(0);
  });

  test("findBestGuides mantém só o guia mais próximo por orientação", () => {
    const near = { start: { x: 1, y: 0 }, end: { x: 1, y: 10 }, orientation: "vertical" as const, distance: 1 };
    const far = { start: { x: 9, y: 0 }, end: { x: 9, y: 10 }, orientation: "vertical" as const, distance: 9 };
    const best = findBestGuides({ x: 0, y: 5 }, [far, near]);
    expect(best).toHaveLength(1);
    expect(best[0].start.x).toBe(1);
  });

  test("um guia vertical e um horizontal juntos formam uma cruz (os dois sobrevivem)", () => {
    const vertical = { start: { x: 5, y: 0 }, end: { x: 5, y: 10 }, orientation: "vertical" as const, distance: 1 };
    const horizontal = { start: { x: 0, y: 5 }, end: { x: 10, y: 5 }, orientation: "horizontal" as const, distance: 1 };
    const best = findBestGuides({ x: 5, y: 5 }, [vertical, horizontal]);
    expect(best).toHaveLength(2);
  });

  test("sem nenhum guia candidato, devolve lista vazia", () => {
    expect(findBestGuides({ x: 0, y: 0 }, [])).toEqual([]);
  });
});
