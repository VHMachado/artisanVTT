import { describe, expect, test } from "vitest";

import { isOutline } from "./Outline";

/**
 * The token outline schema was rewritten from scratch. Cobertura
 * mínima: cada variante válida passa, e cada campo obrigatório que
 * falta reprova.
 */
const validCircle = { type: "circle", x: 0, y: 0, radius: 1 };
const validRect = { type: "rect", x: 0, y: 0, width: 1, height: 1 };
const validPath = { type: "path", points: [0, 0, 1, 0, 1, 1] };

describe("isOutline", () => {
  test("aceita um circle válido", () => {
    expect(isOutline(validCircle)).toBe(true);
  });

  test("aceita um rect válido", () => {
    expect(isOutline(validRect)).toBe(true);
  });

  test("aceita um path válido", () => {
    expect(isOutline(validPath)).toBe(true);
  });

  test.each(["type", "x", "y", "radius"])(
    "rejeita circle sem o campo obrigatório '%s'",
    (field) => {
      const { [field]: _omitted, ...rest } = validCircle as Record<
        string,
        unknown
      >;
      expect(isOutline(rest)).toBe(false);
    }
  );

  test.each(["type", "x", "y", "width", "height"])(
    "rejeita rect sem o campo obrigatório '%s'",
    (field) => {
      const { [field]: _omitted, ...rest } = validRect as Record<
        string,
        unknown
      >;
      expect(isOutline(rest)).toBe(false);
    }
  );

  test.each(["type", "points"])(
    "rejeita path sem o campo obrigatório '%s'",
    (field) => {
      const { [field]: _omitted, ...rest } = validPath as Record<
        string,
        unknown
      >;
      expect(isOutline(rest)).toBe(false);
    }
  );

  test("rejeita type desconhecido", () => {
    expect(isOutline({ ...validCircle, type: "hexagon" })).toBe(false);
  });

  test("rejeita um ponto não numérico em path", () => {
    expect(isOutline({ type: "path", points: [0, "1", 1, 0] })).toBe(false);
  });
});
