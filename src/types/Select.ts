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
   * Pedido do usuário (2026-10-12): shift+click multi-seleção
   * (useMapSelection.tsx's handleTokenShiftClick) — true só para uma
   * seleção construída clicando tokens individualmente, nunca para uma
   * desenhada com a marquee (SelectTool's handleBrushUp nunca seta este
   * campo, então fica undefined/falsy ali, lido como false). Usado por
   * SelectTool.tsx para decidir SE a shape Konva arrastável de grupo
   * (components/konva/Selection.tsx) deve renderizar: ela intercepta
   * cliques em toda sua bounding box (inclusive sobre tokens), o que
   * quebraria o toggle de shift+click num token já selecionado — então
   * o arraste em grupo de uma seleção por clique é feito por
   * Token.tsx's próprio mecanismo de "tokens anexados" em vez desta
   * shape, deixando cada token individualmente clicável.
   */
  builtByClick?: boolean;
}

export type RectSelection = BaseSelection & { type: "rectangle"; data: RectData };

export type PathSelection = BaseSelection & { type: "path"; data: PointsData };

export type Selection = RectSelection | PathSelection;
