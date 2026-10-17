import { describe, expect, test } from "vitest";

import {
  fogSegments,
  raySegmentDistance,
  segmentsNearLight,
  segmentsSignature,
  visibilityPolygon,
} from "./visibility";
import type { Segment } from "./visibility";

import type { Fog } from "../types/Fog";

/**
 * Geometria de oclusão. Tudo aqui é verificável por número
 * exato, e é onde um erro de sinal/winding aparece: `yarn typecheck` e um
 * grep no bundle passam identicamente com a geometria invertida.
 */

function fog(points: number[][], holes: number[][][] = [], visible = true): Fog {
  return {
    id: "f1",
    type: "fog",
    color: "black",
    strokeWidth: 0.5,
    visible,
    data: {
      points: points.map(([x, y]) => ({ x, y })),
      holes: holes.map((hole) => hole.map(([x, y]) => ({ x, y }))),
    },
  };
}

/** Distância da origem até um ponto, para asserir "parou na parede". */
function dist(from: { x: number; y: number }, to: { x: number; y: number }) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

describe("fogSegments", () => {
  test("fecha o anel: N pontos geram N segmentos", () => {
    const segments = fogSegments(
      [fog([[0, 0], [1, 0], [1, 1], [0, 1]])],
      { x: 100, y: 100 }
    );
    expect(segments).toHaveLength(4);
    // O último segmento precisa voltar ao primeiro ponto.
    expect(segments[3].b).toEqual({ x: 0, y: 0 });
  });

  test("escala de normalizado para pixels do mapa", () => {
    const segments = fogSegments([fog([[0, 0], [0.5, 0], [0.5, 0.5]])], {
      x: 200,
      y: 400,
    });
    expect(segments[0].a).toEqual({ x: 0, y: 0 });
    expect(segments[0].b).toEqual({ x: 100, y: 0 });
    expect(segments[1].b).toEqual({ x: 100, y: 200 });
  });

  test("fog invisível não bloqueia nada", () => {
    const segments = fogSegments(
      [fog([[0, 0], [1, 0], [1, 1]], [], false)],
      { x: 100, y: 100 }
    );
    expect(segments).toHaveLength(0);
  });

  test("buracos do fog também são paredes", () => {
    const segments = fogSegments(
      [
        fog(
          [[0, 0], [1, 0], [1, 1], [0, 1]],
          [[[0.2, 0.2], [0.4, 0.2], [0.4, 0.4], [0.2, 0.4]]]
        ),
      ],
      { x: 100, y: 100 }
    );
    // 4 do anel externo + 4 do buraco.
    expect(segments).toHaveLength(8);
  });

  test("ignora segmento degenerado (dois pontos iguais)", () => {
    const segments = fogSegments(
      [fog([[0, 0], [0, 0], [1, 1]])],
      { x: 100, y: 100 }
    );
    // (0,0)->(0,0) descartado; sobram (0,0)->(100,100) e (100,100)->(0,0).
    expect(segments).toHaveLength(2);
  });
});

describe("raySegmentDistance", () => {
  const origin = { x: 0, y: 0 };

  test("acha a distância de um acerto frontal", () => {
    const seg: Segment = { a: { x: 5, y: -1 }, b: { x: 5, y: 1 } };
    expect(raySegmentDistance(origin, { x: 1, y: 0 }, seg)).toBeCloseTo(5);
  });

  test("não acerta o que está atrás do raio", () => {
    const seg: Segment = { a: { x: -5, y: -1 }, b: { x: -5, y: 1 } };
    expect(raySegmentDistance(origin, { x: 1, y: 0 }, seg)).toBeUndefined();
  });

  test("não acerta quando o raio passa fora das pontas do segmento", () => {
    const seg: Segment = { a: { x: 5, y: 10 }, b: { x: 5, y: 20 } };
    expect(raySegmentDistance(origin, { x: 1, y: 0 }, seg)).toBeUndefined();
  });

  test("segmento paralelo ao raio não acerta", () => {
    const seg: Segment = { a: { x: 1, y: 0 }, b: { x: 9, y: 0 } };
    expect(raySegmentDistance(origin, { x: 1, y: 0 }, seg)).toBeUndefined();
  });

  test("funciona em diagonal", () => {
    // Parede vertical em x=3; raio a 45° cruza em (3,3).
    const seg: Segment = { a: { x: 3, y: 0 }, b: { x: 3, y: 10 } };
    const inv = Math.SQRT1_2;
    expect(
      raySegmentDistance(origin, { x: inv, y: inv }, seg)
    ).toBeCloseTo(Math.hypot(3, 3));
  });
});

describe("segmentsNearLight", () => {
  test("descarta o que está fora do alcance e mantém o que está dentro", () => {
    const near: Segment = { a: { x: 10, y: 0 }, b: { x: 10, y: 10 } };
    const far: Segment = { a: { x: 900, y: 0 }, b: { x: 900, y: 10 } };
    const kept = segmentsNearLight([near, far], { x: 0, y: 0 }, 50);
    expect(kept).toEqual([near]);
  });

  test("mantém um segmento longo que atravessa o disco", () => {
    const crossing: Segment = { a: { x: -500, y: 5 }, b: { x: 500, y: 5 } };
    const kept = segmentsNearLight([crossing], { x: 0, y: 0 }, 50);
    expect(kept).toHaveLength(1);
  });
});

describe("visibilityPolygon", () => {
  const origin = { x: 0, y: 0 };

  test("raio zero não desenha nada", () => {
    expect(visibilityPolygon(origin, 0, [])).toEqual([]);
  });

  test("sem paredes, aproxima o círculo inteiro no raio pedido", () => {
    const poly = visibilityPolygon(origin, 100, []);
    // Grade de 6° → ~60 lados; todos no raio máximo.
    expect(poly.length).toBeGreaterThanOrEqual(60);
    for (const p of poly) {
      expect(dist(origin, p)).toBeCloseTo(100, 6);
    }
  });

  test("uma parede encurta os raios que a atravessam, e só eles", () => {
    // Parede vertical em x=50, alta o suficiente para cobrir a direita.
    const wall: Segment = { a: { x: 50, y: -200 }, b: { x: 50, y: 200 } };
    const poly = visibilityPolygon(origin, 300, [wall]);

    // Para a direita (ângulo 0) tem que parar na parede, não no raio.
    const toRight = poly.filter((p) => p.x > 0 && Math.abs(p.y) < 1);
    expect(toRight.length).toBeGreaterThan(0);
    for (const p of toRight) {
      expect(p.x).toBeCloseTo(50, 6);
    }

    // Para a esquerda nada bloqueia: continua no raio cheio.
    const farLeft = poly.find((p) => p.x < -299);
    expect(farLeft).toBeDefined();
  });

  test("a luz não escapa de uma sala fechada", () => {
    // Caixa de 100x100 em volta da origem; raio muito maior que a sala.
    const box: Segment[] = [
      { a: { x: -50, y: -50 }, b: { x: 50, y: -50 } },
      { a: { x: 50, y: -50 }, b: { x: 50, y: 50 } },
      { a: { x: 50, y: 50 }, b: { x: -50, y: 50 } },
      { a: { x: -50, y: 50 }, b: { x: -50, y: -50 } },
    ];
    const poly = visibilityPolygon(origin, 1000, box);
    expect(poly.length).toBeGreaterThan(0);
    // Nenhum vértice pode cair fora da caixa (tolerância do epsilon).
    for (const p of poly) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(50.01);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(50.01);
    }
  });

  test("gera a quina da sombra: dois vértices no mesmo ângulo do canto", () => {
    // Parede curta à direita: o raio que raspa a ponta precisa seguir até
    // o fundo, gerando a aresta reta da sombra.
    const wall: Segment = { a: { x: 50, y: -10 }, b: { x: 50, y: 10 } };
    const poly = visibilityPolygon(origin, 300, [wall]);
    const stopped = poly.filter((p) => Math.abs(p.x - 50) < 0.5);
    const passed = poly.filter((p) => dist(origin, p) > 299);
    // Tem que existir os dois comportamentos no mesmo polígono.
    expect(stopped.length).toBeGreaterThan(0);
    expect(passed.length).toBeGreaterThan(0);
  });

  test("setor (cone) começa no ápice e respeita a abertura", () => {
    // Cone de 90° apontando para a direita (startAngle 0).
    const poly = visibilityPolygon(origin, 100, [], {
      startAngle: 0,
      angleSpan: Math.PI / 2,
    });
    // Primeiro vértice é o próprio token, fechando a cunha.
    expect(poly[0]).toEqual({ x: 0, y: 0 });
    // Nenhum vértice fora do quadrante [0°, 90°] (x>=0 e y>=0 em canvas).
    for (const p of poly.slice(1)) {
      expect(p.x).toBeGreaterThanOrEqual(-0.01);
      expect(p.y).toBeGreaterThanOrEqual(-0.01);
    }
  });

  test("cone 360° não vira setor (sem ápice duplicado)", () => {
    const poly = visibilityPolygon(origin, 100, [], {
      startAngle: 0,
      angleSpan: Math.PI * 2,
    });
    expect(poly[0]).not.toEqual({ x: 0, y: 0 });
  });

  test("cone também é bloqueado por parede dentro do seu setor", () => {
    const wall: Segment = { a: { x: 30, y: -100 }, b: { x: 30, y: 100 } };
    const poly = visibilityPolygon(origin, 300, [wall], {
      startAngle: -Math.PI / 8,
      angleSpan: Math.PI / 4,
    });
    for (const p of poly.slice(1)) {
      expect(p.x).toBeLessThanOrEqual(30.01);
    }
  });

  test("vértices saem em ordem de ângulo crescente", () => {
    const wall: Segment = { a: { x: 50, y: -10 }, b: { x: 50, y: 10 } };
    const poly = visibilityPolygon(origin, 300, [wall]);
    const angles = poly.map((p) => Math.atan2(p.y - origin.y, p.x - origin.x));
    // atan2 devolve (-π, π]; o sweep começa em 0, então a sequência é
    // crescente com no máximo um salto ao cruzar π.
    let wraps = 0;
    for (let i = 1; i < angles.length; i++) {
      if (angles[i] < angles[i - 1] - 1e-6) {
        wraps++;
      }
    }
    expect(wraps).toBeLessThanOrEqual(1);
  });

  test("parede fora do alcance não altera o resultado", () => {
    const far: Segment = { a: { x: 5000, y: -10 }, b: { x: 5000, y: 10 } };
    const withWall = visibilityPolygon(origin, 100, [far]);
    const withoutWall = visibilityPolygon(origin, 100, []);
    expect(withWall).toEqual(withoutWall);
  });
});

describe("segmentsSignature", () => {
  test("muda quando uma parede se move", () => {
    const a: Segment[] = [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }];
    const b: Segment[] = [{ a: { x: 0, y: 0 }, b: { x: 11, y: 0 } }];
    expect(segmentsSignature(a)).not.toBe(segmentsSignature(b));
  });

  test("é estável para a mesma geometria", () => {
    const a: Segment[] = [{ a: { x: 1, y: 2 }, b: { x: 3, y: 4 } }];
    const b: Segment[] = [{ a: { x: 1, y: 2 }, b: { x: 3, y: 4 } }];
    expect(segmentsSignature(a)).toBe(segmentsSignature(b));
  });

  test("ignora diferença sub-pixel (não invalida o cache à toa)", () => {
    const a: Segment[] = [{ a: { x: 0, y: 0 }, b: { x: 10.001, y: 0 } }];
    const b: Segment[] = [{ a: { x: 0, y: 0 }, b: { x: 10.002, y: 0 } }];
    expect(segmentsSignature(a)).toBe(segmentsSignature(b));
  });
});
