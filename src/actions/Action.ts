import cloneDeep from "lodash.clonedeep";
import type { Diff } from "deep-diff";

import { diff, revertChanges } from "../helpers/diff";

class Action<State> {
  changes: Diff<State, State>[] | undefined;

  update(state: State) {
    return state;
  }

  execute(state: State) {
    if (!state || !this.update) {
      return state;
    }
    const nextState = this.update(cloneDeep(state));
    this.changes = diff(state, nextState);
    return nextState;
  }

  undo(state: State) {
    if (!state || !this.changes) {
      return state;
    }
    const previousState = cloneDeep(state);
    revertChanges(previousState, this.changes);
    return previousState;
  }
}

export default Action;
