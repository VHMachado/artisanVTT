import { describe, expect, test } from "vitest";

import { isFog } from "./Fog";

/**
 * The fog schema was rewritten from scratch. Cobertura mínima: a forma
 * válida passa, e cada campo obrigatório que falta reprova.
 */
const validFog = {
  id: "fog-1",
  type: "fog",
  color: "black",
  strokeWidth: 0.5,
  visible: true,
  data: {
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ],
    holes: [],
  },
};

describe("isFog", () => {
  test("uma forma válida passa", () => {
    expect(isFog(validFog)).toBe(true);
  });

  test("aceita buracos (anéis internos)", () => {
    expect(
      isFog({
        ...validFog,
        data: {
          ...validFog.data,
          holes: [
            [
              { x: 0.2, y: 0.2 },
              { x: 0.4, y: 0.2 },
              { x: 0.4, y: 0.4 },
            ],
          ],
        },
      })
    ).toBe(true);
  });

  test("rejeita type diferente de 'fog'", () => {
    expect(isFog({ ...validFog, type: "not-fog" })).toBe(false);
  });

  test("rejeita cor fora do enum conhecido", () => {
    expect(isFog({ ...validFog, color: "magenta" })).toBe(false);
  });

  test.each(["color", "data", "id", "strokeWidth", "type", "visible"])(
    "rejeita quando falta o campo obrigatório '%s'",
    (field) => {
      const { [field]: _omitted, ...rest } = validFog as Record<
        string,
        unknown
      >;
      expect(isFog(rest)).toBe(false);
    }
  );

  test("rejeita data sem 'points'", () => {
    const { points: _omitted, ...rest } = validFog.data;
    expect(isFog({ ...validFog, data: rest })).toBe(false);
  });

  test("rejeita data sem 'holes'", () => {
    const { holes: _omitted, ...rest } = validFog.data;
    expect(isFog({ ...validFog, data: rest })).toBe(false);
  });

  test("rejeita um ponto sem 'y'", () => {
    expect(
      isFog({
        ...validFog,
        data: { ...validFog.data, points: [{ x: 0 }] },
      })
    ).toBe(false);
  });
});
