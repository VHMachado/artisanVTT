import { describe, expect, test } from "vitest";

import {
  MAX_DICE_TOTAL,
  newRollSeed,
  parseSharedDiceRoll,
  seededRandom,
  squareDiceRollExtents,
  visibleHalfExtents,
} from "./diceRoll";

/**
 * Estes helpers carregam as duas premissas da rolagem
 * sobre a grid — a semente reproduzir o MESMO arremesso em dois clientes, e
 * a arena invisível ter exatamente o tamanho do que a câmera enquadra.
 */
describe("seededRandom", () => {
  test("a mesma semente produz a mesma sequência", () => {
    const a = seededRandom(1234);
    const b = seededRandom(1234);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  test("sementes diferentes divergem", () => {
    const a = seededRandom(1234);
    const b = seededRandom(1235);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  test("fica em [0, 1)", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 500; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test("não devolve o mesmo valor repetido (seria um PRNG travado)", () => {
    const random = seededRandom(42);
    const values = new Set(Array.from({ length: 50 }, () => random()));
    expect(values.size).toBeGreaterThan(40);
  });
});

describe("newRollSeed", () => {
  test("cabe num inteiro de 32 bits positivo, que é o que vai no fio", () => {
    for (let i = 0; i < 100; i += 1) {
      const seed = newRollSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0x7fffffff);
    }
  });

  test("sobrevive ao round trip por JSON (é assim que chega ao broker)", () => {
    const seed = newRollSeed();
    expect(JSON.parse(JSON.stringify({ seed })).seed).toBe(seed);
  });
});

describe("parseSharedDiceRoll", () => {
  test("aceita somente os tipos conhecidos e arredonda contagens", () => {
    expect(
      parseSharedDiceRoll({
        counts: { d6: 2.9, d20: 1, d7: 10 },
        seed: 1234,
      })
    ).toEqual({ counts: { d6: 2, d20: 1 }, seed: 1234 });
  });

  test("limita cada tipo antes de criar meshes", () => {
    expect(
      parseSharedDiceRoll({ counts: { d6: 999 }, seed: 1 })
    ).toEqual({ counts: { d6: 20 }, seed: 1 });
  });

  test("rejeita total acima do teto global", () => {
    expect(
      parseSharedDiceRoll({
        counts: { d4: 20, d6: 20, d8: 20, d10: 1 },
        seed: 1,
      })
    ).toBeNull();
    expect(MAX_DICE_TOTAL).toBe(60);
  });

  test.each([
    null,
    {},
    { counts: {}, seed: 1 },
    { counts: { d6: 1 }, seed: -1 },
    { counts: { d6: 1 }, seed: 1.5 },
    { counts: { d6: 1 }, seed: 0x80000000 },
    { counts: { d7: 1 }, seed: 1 },
  ])("rejeita payload inválido: %j", (payload) => {
    expect(parseSharedDiceRoll(payload)).toBeNull();
  });
});

describe("visibleHalfExtents", () => {
  // O fov do Babylon é VERTICAL por padrão (FOVMODE_VERTICAL_FIXED), então
  // é a PROFUNDIDADE que sai direto da tangente e a largura que depende do
  // aspecto. Trocar os dois é o erro silencioso aqui: num canvas
  // panorâmico as paredes ficariam estreitas e o dado bateria numa parede
  // invisível no meio do mapa.
  test("a profundidade não depende do aspecto", () => {
    const wide = visibleHalfExtents(33.5, 0.65, 2);
    const tall = visibleHalfExtents(33.5, 0.65, 0.5);
    expect(wide.halfDepth).toBeCloseTo(tall.halfDepth, 10);
  });

  test("a largura escala com o aspecto", () => {
    const { halfWidth, halfDepth } = visibleHalfExtents(33.5, 0.65, 16 / 9);
    expect(halfWidth).toBeCloseTo(halfDepth * (16 / 9), 10);
  });

  test("casa com a trigonometria da câmera", () => {
    const cameraHeight = 33.5;
    const fov = 0.65;
    const { halfDepth } = visibleHalfExtents(cameraHeight, fov, 1);
    expect(halfDepth).toBeCloseTo(cameraHeight * Math.tan(fov / 2), 10);
  });

  test("uma câmera mais alta enquadra mais área", () => {
    const low = visibleHalfExtents(20, 0.65, 1);
    const high = visibleHalfExtents(40, 0.65, 1);
    expect(high.halfDepth).toBeGreaterThan(low.halfDepth);
    expect(high.halfWidth).toBeGreaterThan(low.halfWidth);
  });

  test("devolve extensões positivas para a câmera real do app", () => {
    // Os valores que DiceInteraction usa hoje: TargetCamera em y=33.5 com
    // fov 0.65.
    const { halfWidth, halfDepth } = visibleHalfExtents(33.5, 0.65, 16 / 9);
    expect(halfDepth).toBeGreaterThan(0);
    expect(halfWidth).toBeGreaterThan(halfDepth);
  });
});

describe("squareDiceRollExtents", () => {
  test("vira um quadrado do menor lado quando a tela é mais larga", () => {
    const { halfWidth, halfDepth } = squareDiceRollExtents({
      halfWidth: 8,
      halfDepth: 3,
    });
    expect(halfWidth).toBeCloseTo(3 * 0.4, 10);
    expect(halfDepth).toBeCloseTo(3 * 0.4, 10);
  });

  test("vira um quadrado do menor lado quando a tela é mais alta", () => {
    const { halfWidth, halfDepth } = squareDiceRollExtents({
      halfWidth: 2,
      halfDepth: 6,
    });
    expect(halfWidth).toBeCloseTo(2 * 0.4, 10);
    expect(halfDepth).toBeCloseTo(2 * 0.4, 10);
  });

  test("é proporcional, não um teto absoluto — uma tela maior dá uma área maior", () => {
    const small = squareDiceRollExtents({ halfWidth: 10, halfDepth: 10 });
    const large = squareDiceRollExtents({ halfWidth: 50, halfDepth: 50 });
    expect(large.halfWidth).toBeGreaterThan(small.halfWidth);
    expect(large.halfDepth).toBeGreaterThan(small.halfDepth);
  });

  test("não aumenta a área visível, só limita", () => {
    const { halfWidth, halfDepth } = squareDiceRollExtents({
      halfWidth: 2,
      halfDepth: 1,
    });
    expect(halfWidth).toBeLessThanOrEqual(2);
    expect(halfDepth).toBeLessThanOrEqual(2);
  });
});
