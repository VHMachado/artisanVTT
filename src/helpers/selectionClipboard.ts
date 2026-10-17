import { MapState } from "../types/MapState";
import { Selection, SelectionItem } from "../types/Select";
import { TokenState, TokenStates } from "../types/TokenState";
import { getSelectionPoints } from "./selection";
import Vector2 from "./Vector2";

export type SelectionClipboard = {
  version: string;
  data: MapState;
  selection: Selection;
};

export function selectionClipboard(version: string, selection: Selection, mapState: MapState): SelectionClipboard {
  const tokens: TokenStates = {};
  for (const item of selection.items) {
    const token = mapState.tokens[item.id];
    if (token) tokens[item.id] = token;
  }
  return {
    version,
    selection,
    data: { tokens, editFlags: [], fogs: {}, mapId: mapState.mapId },
  };
}

export function relocateClipboard(
  clipboard: SelectionClipboard,
  destination: Vector2,
  createId: () => string
): { tokens: TokenState[]; selection: Selection } {
  const center = Vector2.centroid(getSelectionPoints(clipboard.selection));
  const offset = Vector2.subtract(destination, center);
  const items: SelectionItem[] = [];
  const tokens = Object.values(clipboard.data.tokens).map((token) => {
    const id = createId();
    items.push({ id, type: "token" });
    return { ...token, id, x: token.x + offset.x, y: token.y + offset.y };
  });

  return {
    tokens,
    selection: {
      ...clipboard.selection,
      items,
      x: clipboard.selection.x + offset.x,
      y: clipboard.selection.y + offset.y,
    },
  };
}
