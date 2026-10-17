import { describe, expect, test } from "vitest";

import { isSelection } from "./Selection";

/**
 * The selection schema was rewritten from scratch. Cobertura mínima: cada
 * variante válida passa, e cada campo obrigatório que falta reprova.
 */
const validRectSelection = {
  type: "rectangle",
  items: [{ type: "token", id: "token-1" }],
  x: 0,
  y: 0,
  data: { x: 0, y: 0, width: 1, height: 1 },
};

const validPathSelection = {
  type: "path",
  items: [],
  x: 0,
  y: 0,
  data: { points: [{ x: 0, y: 0 }] },
};

describe("isSelection", () => {
  test("aceita uma seleção retangular válida", () => {
    expect(isSelection(validRectSelection)).toBe(true);
  });

  test("aceita uma seleção de path válida", () => {
    expect(isSelection(validPathSelection)).toBe(true);
  });

  test.each(["items", "x", "y", "type", "data"])(
    "rejeita quando falta o campo obrigatório '%s'",
    (field) => {
      const { [field]: _omitted, ...rest } = validRectSelection as Record<
        string,
        unknown
      >;
      expect(isSelection(rest)).toBe(false);
    }
  );

  test("rejeita type diferente de 'rectangle'/'path'", () => {
    expect(isSelection({ ...validRectSelection, type: "circle" })).toBe(
      false
    );
  });

  test("rejeita item de seleção com type diferente de 'token'", () => {
    expect(
      isSelection({
        ...validRectSelection,
        items: [{ type: "note", id: "note-1" }],
      })
    ).toBe(false);
  });

  test("rejeita item de seleção sem id", () => {
    expect(
      isSelection({
        ...validRectSelection,
        items: [{ type: "token" }],
      })
    ).toBe(false);
  });
});
