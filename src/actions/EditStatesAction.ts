import type { ID } from "../types/Action";
import Action from "./Action";

type StateIndex<Item extends ID> = Record<string, Item>;
function applyKnownPatch<Item extends ID>(
  current: StateIndex<Item>,
  patch: Partial<Item>
): StateIndex<Item> {
  const id = patch.id;
  const target = id === undefined ? undefined : current[id];
  return target === undefined || id === undefined
    ? current
    : { ...current, [id]: { ...target, ...patch } };
}
class EditStatesAction<Item extends ID> extends Action<StateIndex<Item>> {
  constructor(private readonly patches: Partial<Item>[]) {
    super();
  }
  update(current: StateIndex<Item>) {
    return this.patches.reduce(applyKnownPatch, current);
  }
}
export default EditStatesAction;
