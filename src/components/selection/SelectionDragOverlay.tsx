import DragOverlay from "../map/DragOverlay";
import { Selection } from "../../types/Select";
import { SelectionItemsRemoveEventHandler } from "../../types/Events";

interface SelectionDragOverlayProps {
  dragging: boolean;
  selection: Selection;
  onSelectionItemsRemove: SelectionItemsRemoveEventHandler;
}

function allItemIds({ items }: Selection): string[] {
  return items.map(({ id }) => id);
}

/** A seleção em massa só opera tokens agora (as notas post-it
 * saíram do produto), então isto remove tokens — o nome antigo
 * `NoteDragOverlay` era resíduo de quando o arquivo nasceu para notas. */
function SelectionDragOverlay({
  onSelectionItemsRemove,
  selection,
  dragging,
}: SelectionDragOverlayProps) {
  const removeSelected = () => onSelectionItemsRemove(allItemIds(selection));
  return <DragOverlay dragging={dragging} onRemove={removeSelected} />;
}

export default SelectionDragOverlay;
