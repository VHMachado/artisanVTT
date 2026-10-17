import { describe, expect, test } from "vitest";

import { boundingSelectionForTokens, getSelectionPoints } from "./selection";

import { PathSelection, RectSelection } from "../types/Select";
import { MapState } from "../types/MapState";
import { TokenState } from "../types/TokenState";

/**
 * `getSelectionPoints` reescrita do
 * zero: converte a seleção
 * (lasso ou retângulo) num array de pontos usado pelo teste de
 * interseção contra tokens. Sem teste anterior na implementação original —
 * cobertura equivalente por comportamento.
 */
describe("getSelectionPoints", () => {
  test("uma seleção de path devolve os próprios pontos", () => {
    const selection: PathSelection = {
      type: "path",
      items: [],
      x: 0,
      y: 0,
      data: {
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    };
    expect(getSelectionPoints(selection)).toBe(selection.data.points);
  });

  test("uma seleção retangular devolve os quatro cantos em sentido horário", () => {
    const selection: RectSelection = {
      type: "rectangle",
      items: [],
      x: 0,
      y: 0,
      data: { x: 1, y: 2, width: 3, height: 4 },
    };
    expect(getSelectionPoints(selection)).toEqual([
      { x: 1, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 6 },
      { x: 1, y: 6 },
    ]);
  });
});

/**
 * Pedido do usuário (2026-10-12) — shift+click multi-seleção:
 * `boundingSelectionForTokens` constrói a geometria da seleção clicada
 * a partir das posições atuais dos tokens.
 */
function minimalToken(id: string, x: number, y: number): TokenState {
  return {
    id,
    tokenId: `tok-${id}`,
    owner: "user-1",
    size: 1,
    category: "character",
    label: id,
    statuses: [],
    x,
    y,
    lastModifiedBy: "user-1",
    lastModified: 0,
    rotation: 0,
    locked: false,
    visible: true,
    outline: { type: "circle", x: 0, y: 0, radius: 1 },
    width: 1,
    height: 1,
    type: "default",
    key: "__default-token",
  };
}

function mapStateWithTokens(tokens: TokenState[]): MapState {
  const byId: Record<string, TokenState> = {};
  for (const token of tokens) {
    byId[token.id] = token;
  }
  return { tokens: byId, fogs: {}, editFlags: [], mapId: "map-1" };
}

describe("boundingSelectionForTokens", () => {
  test("devolve um box zerado para uma lista vazia", () => {
    const mapState = mapStateWithTokens([]);
    expect(boundingSelectionForTokens([], mapState)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });

  test("devolve um box ao redor de um único token com padding simétrico", () => {
    const mapState = mapStateWithTokens([minimalToken("a", 0.5, 0.5)]);
    const box = boundingSelectionForTokens(["a"], mapState);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    // O token está no centro do box (padding simétrico nos dois lados).
    expect(box.x + box.width / 2).toBeCloseTo(0.5);
    expect(box.y + box.height / 2).toBeCloseTo(0.5);
  });

  test("engloba todos os tokens pedidos, ignorando ids inexistentes", () => {
    const mapState = mapStateWithTokens([
      minimalToken("a", 0.1, 0.1),
      minimalToken("b", 0.9, 0.9),
    ]);
    const box = boundingSelectionForTokens(["a", "b", "ghost"], mapState);
    expect(box.x).toBeLessThan(0.1);
    expect(box.y).toBeLessThan(0.1);
    expect(box.x + box.width).toBeGreaterThan(0.9);
    expect(box.y + box.height).toBeGreaterThan(0.9);
  });
});
