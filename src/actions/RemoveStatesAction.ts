import type { ID } from "../types/Action";
import Action from "./Action";

type StateIndex<Item extends ID> = Record<string, Item>;
function withoutIds<Item extends ID>(
  current: StateIndex<Item>,
  removed: ReadonlySet<string>
): StateIndex<Item> {
  const retained: StateIndex<Item> = {};
  Object.entries(current).forEach(([id, item]) => {
    if (!removed.has(id)) retained[id] = item;
  });
  return retained;
}
class RemoveStatesAction<Item extends ID> extends Action<StateIndex<Item>> {
  private readonly ids: Set<string>;
  constructor(ids: string[]) {
    super();
    this.ids = new Set(ids);
  }
  update(current: StateIndex<Item>) {
    return withoutIds(current, this.ids);
  }
}
export default RemoveStatesAction;
