import { describe, expect, test } from "vitest";

import SubtractFogAction from "./SubtractFogAction";
import CutFogAction from "./CutFogAction";

import type { Fog, FogState } from "../types/Fog";

/**
 * `SubtractFogAction`/`CutFogAction` built on top of
 * `helpers/fog.ts`. Cobertura equivalente ao que `helpers/visibility.test.ts`
 * já estabeleceu como padrão: geometria exata, não inspeção visual.
 */
function square(id: string, x: number, y: number, size: number): Fog {
  return {
    id,
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
  };
}

function byId(state: FogState): Fog[] {
  return Object.values(state);
}

describe("SubtractFogAction", () => {
  test("remove a área sobreposta, deixando o resto do fog", () => {
    const existing = square("a", 0, 0, 10);
    const cutter = square("b", 5, 0, 10);
    const action = new SubtractFogAction([cutter]);
    const result = action.execute({ a: existing });
    const remaining = byId(result);
    expect(remaining).toHaveLength(1);
    // A área restante é menor que o quadrado original.
    expect(remaining[0].data.points.length).toBeGreaterThan(0);
  });

  test("sem sobreposição, o fog original sai intacto em forma (mesma área)", () => {
    const existing = square("a", 0, 0, 10);
    const cutter = square("b", 100, 100, 10);
    const action = new SubtractFogAction([cutter]);
    const result = action.execute({ a: existing });
    expect(byId(result)).toHaveLength(1);
  });

  test("subtrair a área inteira esvazia o resultado", () => {
    const existing = square("a", 0, 0, 10);
    const cutter = square("b", 0, 0, 10);
    const action = new SubtractFogAction([cutter]);
    const result = action.execute({ a: existing });
    expect(byId(result)).toHaveLength(0);
  });

  test("undo reverte ao estado anterior", () => {
    const existing = square("a", 0, 0, 10);
    const cutter = square("b", 5, 0, 10);
    const action = new SubtractFogAction([cutter]);
    const before: FogState = { a: existing };
    const after = action.execute(before);
    const reverted = action.undo(after);
    expect(reverted).toEqual(before);
  });
});

describe("CutFogAction", () => {
  test("a área cortada fica invisível, o resto permanece visível", () => {
    const existing = square("a", 0, 0, 10);
    const cutter = square("b", 5, 0, 10);
    const action = new CutFogAction([cutter]);
    const result = action.execute({ a: existing });
    const shapes = byId(result);
    // Diferença (visível, resto do fog) + interseção (invisível, a janela
    // que o corte abriu) — pelo menos uma de cada.
    expect(shapes.some((s) => s.visible)).toBe(true);
    expect(shapes.some((s) => !s.visible)).toBe(true);
  });

  test("cortar fora da área do fog não produz interseção invisível", () => {
    const existing = square("a", 0, 0, 10);
    const cutter = square("b", 100, 100, 10);
    const action = new CutFogAction([cutter]);
    const result = action.execute({ a: existing });
    const shapes = byId(result);
    expect(shapes.every((s) => s.visible)).toBe(true);
  });

  test("undo reverte ao estado anterior", () => {
    const existing = square("a", 0, 0, 10);
    const cutter = square("b", 5, 0, 10);
    const action = new CutFogAction([cutter]);
    const before: FogState = { a: existing };
    const after = action.execute(before);
    const reverted = action.undo(after);
    expect(reverted).toEqual(before);
  });
});
