import { describe, expect, it } from "vitest";

import Action from "./Action";

class IncrementAction extends Action<{ count: number; nested: { value: number } }> {
  update(state: { count: number; nested: { value: number } }) {
    state.count += 1;
    state.nested.value += 1;
    return state;
  }
}

describe("Action", () => {
  it("executes against a clone and records changes that undo can reverse", () => {
    const action = new IncrementAction();
    const before = { count: 1, nested: { value: 2 } };

    const after = action.execute(before);

    expect(after).toEqual({ count: 2, nested: { value: 3 } });
    expect(after).not.toBe(before);
    expect(before).toEqual({ count: 1, nested: { value: 2 } });
    expect(action.undo(after)).toEqual(before);
  });

  it("leaves falsy state unchanged", () => {
    const action = new IncrementAction();

    expect(action.execute(undefined as never)).toBeUndefined();
    expect(action.undo(undefined as never)).toBeUndefined();
  });
});
