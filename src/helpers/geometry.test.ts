import { describe, expect, test } from "vitest";

import {
  getDefaultShapeData,
  getGridCellRatio,
  getUpdatedShapeData,
  simplifyPoints,
} from "./geometry";

import { CircleData, PointsData, RectData } from "../types/Geometry";

/**
 * Geometria de desenho (`getDefaultShapeData`/
 * `getUpdatedShapeData`/`getGridCellRatio`/`simplifyPoints`) reescrita do
 * zero contra o mesmo contrato: tipo de forma + posição do ponteiro
 * entram, dados normalizados saem. A implementação anterior não tinha teste para
 * este arquivo — cobertura equivalente por comportamento, não 1:1 de
 * arquivo existente.
 */
describe("getDefaultShapeData", () => {
  test("line começa como dois pontos iguais à âncora", () => {
    const data = getDefaultShapeData("line", { x: 1, y: 2 }) as PointsData;
    expect(data.points).toEqual([
      { x: 1, y: 2 },
      { x: 1, y: 2 },
    ]);
  });

  test("circle começa com raio zero na âncora", () => {
    const data = getDefaultShapeData("circle", { x: 1, y: 2 }) as CircleData;
    expect(data).toEqual({ x: 1, y: 2, radius: 0 });
  });

  test("rectangle começa com largura/altura zero na âncora", () => {
    const data = getDefaultShapeData("rectangle", {
      x: 1,
      y: 2,
    }) as RectData;
    expect(data).toEqual({ x: 1, y: 2, width: 0, height: 0 });
  });

  test("triangle começa como três pontos iguais à âncora", () => {
    const data = getDefaultShapeData("triangle", {
      x: 1,
      y: 2,
    }) as PointsData;
    expect(data.points).toHaveLength(3);
    for (const point of data.points) {
      expect(point).toEqual({ x: 1, y: 2 });
    }
  });
});

describe("getGridCellRatio", () => {
  test("célula quadrada não distorce nenhum eixo", () => {
    expect(getGridCellRatio({ x: 10, y: 10 })).toEqual({ x: 1, y: 1 });
  });

  test("célula mais larga que alta escala o eixo x", () => {
    expect(getGridCellRatio({ x: 20, y: 10 })).toEqual({ x: 1, y: 2 });
  });

  test("célula mais alta que larga escala o eixo y", () => {
    expect(getGridCellRatio({ x: 10, y: 20 })).toEqual({ x: 2, y: 1 });
  });
});

describe("getUpdatedShapeData", () => {
  const squareCell = { x: 1, y: 1 };

  test("line atualiza só o segundo ponto, mantendo a âncora", () => {
    const start: PointsData = {
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    };
    const result = getUpdatedShapeData(
      "line",
      start,
      { x: 5, y: 5 },
      squareCell,
      100,
      100
    ) as PointsData;
    expect(result.points).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ]);
  });

  test("circle cresce o raio pela distância até o ponteiro", () => {
    const start: CircleData = { x: 0, y: 0, radius: 0 };
    const result = getUpdatedShapeData(
      "circle",
      start,
      { x: 3, y: 4 },
      squareCell,
      100,
      100
    ) as CircleData;
    // Distância 3-4-5 clássica.
    expect(result.radius).toBeCloseTo(5);
  });

  test("circle com célula não-quadrada escala o raio pela razão da grid", () => {
    const start: CircleData = { x: 0, y: 0, radius: 0 };
    // getGridCellRatio({x: 2, y: 1}) = {x: 1, y: 2} (x é o eixo maior,
    // então o eixo y é o que é escalado para compensar) — um delta puro
    // no eixo x não sofre escala nenhuma neste caso.
    const result = getUpdatedShapeData(
      "circle",
      start,
      { x: 3, y: 0 },
      { x: 2, y: 1 },
      100,
      100
    ) as CircleData;
    expect(result.radius).toBeCloseTo(3);
  });

  test("circle com célula não-quadrada escala o eixo mais denso", () => {
    const start: CircleData = { x: 0, y: 0, radius: 0 };
    // Aqui o delta está no eixo y, que a razão {x: 1, y: 2} dobra antes
    // de medir a magnitude — isso É o comportamento esperado (compensar
    // uma grid não quadrada), não um bug.
    const result = getUpdatedShapeData(
      "circle",
      start,
      { x: 0, y: 3 },
      { x: 2, y: 1 },
      100,
      100
    ) as CircleData;
    expect(result.radius).toBeCloseTo(6);
  });

  test("rectangle deriva width/height da diferença até o ponteiro", () => {
    const start: RectData = { x: 0, y: 0, width: 0, height: 0 };
    const result = getUpdatedShapeData(
      "rectangle",
      start,
      { x: 4, y: -2 },
      squareCell,
      100,
      100
    ) as RectData;
    expect(result).toEqual({ x: 0, y: 0, width: 4, height: -2 });
  });

  test("triangle produz um triângulo isósceles com base no comprimento do arraste", () => {
    const start: PointsData = {
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    };
    const result = getUpdatedShapeData(
      "triangle",
      start,
      { x: 0, y: 0.1 },
      squareCell,
      100,
      100
    ) as PointsData;
    expect(result.points).toHaveLength(3);
    // O ápice permanece a âncora original.
    expect(result.points[0]).toEqual({ x: 0, y: 0 });
    // As duas bases são equidistantes do ápice (triângulo isósceles).
    const distFromApex = (p: { x: number; y: number }) =>
      Math.hypot((p.x - 0) * 100, (p.y - 0) * 100);
    expect(distFromApex(result.points[1])).toBeCloseTo(
      distFromApex(result.points[2])
    );
  });

  test("lança para um tipo de forma desconhecido", () => {
    expect(() =>
      getUpdatedShapeData(
        // @ts-expect-error forçando um tipo inválido para o teste
        "ellipse",
        { x: 0, y: 0, width: 0, height: 0 },
        { x: 1, y: 1 },
        squareCell,
        100,
        100
      )
    ).toThrow();
  });
});

describe("simplifyPoints", () => {
  test("remove pontos colineares redundantes dentro da tolerância", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    const simplified = simplifyPoints(points, 0.5);
    expect(simplified.length).toBeLessThan(points.length);
    expect(simplified[0]).toEqual({ x: 0, y: 0 });
    expect(simplified[simplified.length - 1]).toEqual({ x: 3, y: 0 });
  });

  test("mantém pontos que divergem da linha além da tolerância", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 5 },
      { x: 2, y: 0 },
    ];
    const simplified = simplifyPoints(points, 0.1);
    expect(simplified).toHaveLength(3);
  });
});
