import { RectData, PointsData } from "./Geometry";

// Two ways to define a selection marquee: a free-form lasso (path) or a
// drag rectangle.
export type SelectToolType = "path" | "rectangle";

export interface SelectToolSettings {
  type: SelectToolType;
}

// Removing the post-it note tool also removed "note" as
// a selectable item kind — tokens are the only thing a marquee can pick
// up now.
export type SelectionItemType = "token";

export interface SelectionItem {
  id: string;
  type: SelectionItemType;
}

export interface BaseSelection {
  x: number;
  y: number;
  items: SelectionItem[];
  /**
   * Pedido do usuário (2026-10-12, revisado 2026-10-26): true para
   * qualquer seleção já "resolvida" num grupo de tokens — construída
   * clicando/shift+clicando tokens individualmente (useMapSelection.tsx's
   * buildTokenSelection) OU por uma marquee que terminou de arrastar e
   * encontrou tokens (SelectTool.tsx's `end()`). Nos dois casos o
   * arraste em grupo passa a ser feito pelo mecanismo de "tokens
   * anexados" do próprio Token.tsx (groupSelectedIds), não pela shape
   * Konva arrastável de grupo (components/konva/Selection.tsx) — essa
   * shape intercepta cliques em toda sua bounding box (inclusive sobre
   * tokens), o que impediria clicar e arrastar um token individual
   * dentro da área selecionada, e por isso só renderiza enquanto a
   * seleção ainda está sendo desenhada (`resolved` falso/undefined).
   */
  resolved?: boolean;
}

export type RectSelection = BaseSelection & { type: "rectangle"; data: RectData };

export type PathSelection = BaseSelection & { type: "path"; data: PointsData };

export type Selection = RectSelection | PathSelection;
