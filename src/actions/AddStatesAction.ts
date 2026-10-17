import type { ID } from "../types/Action";
import Action from "./Action";

type StateIndex<Item extends ID> = Record<string, Item>;
function indexById<Item extends ID>(items: Item[]): StateIndex<Item> {
  const indexed: StateIndex<Item> = {};
  for (const item of items) {
    indexed[item.id] = item;
  }
  return indexed;
}
class AddStatesAction<Item extends ID> extends Action<StateIndex<Item>> {
  private readonly incoming: StateIndex<Item>;
  constructor(items: Item[]) {
    super();
    this.incoming = indexById(items);
  }
  update(current: StateIndex<Item>) {
    return { ...current, ...this.incoming };
  }
}
export default AddStatesAction;
