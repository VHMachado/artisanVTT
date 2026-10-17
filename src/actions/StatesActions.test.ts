import { describe, expect, test } from "vitest";

import AddStatesAction from "./AddStatesAction";
import EditStatesAction from "./EditStatesAction";
import RemoveStatesAction from "./RemoveStatesAction";

/**
 * `AddStatesAction`/`EditStatesAction`/`RemoveStatesAction`,
 * written from scratch. Mesmo contrato genérico `Action<Record<string,
 * State>>`: cada um mapeia por `id`, e `undo` sempre volta ao estado
 * anterior via o `Action` base (deep-diff). Sem teste anterior no `.exe`
 * original — cobertura equivalente por comportamento.
 */
type TestState = { id: string; value: number };

describe("AddStatesAction", () => {
  test("adiciona novos estados ao mapa, indexados por id", () => {
    const action = new AddStatesAction<TestState>([
      { id: "a", value: 1 },
      { id: "b", value: 2 },
    ]);
    const result = action.execute({});
    expect(result).toEqual({ a: { id: "a", value: 1 }, b: { id: "b", value: 2 } });
  });

  test("sobrescreve um estado existente com o mesmo id", () => {
    const action = new AddStatesAction<TestState>([{ id: "a", value: 99 }]);
    const result = action.execute({ a: { id: "a", value: 1 } });
    expect(result.a.value).toBe(99);
  });

  test("undo reverte ao estado anterior", () => {
    const action = new AddStatesAction<TestState>([{ id: "a", value: 1 }]);
    const before = {};
    const after = action.execute(before);
    expect(action.undo(after)).toEqual(before);
  });
});

describe("EditStatesAction", () => {
  test("aplica um edit parcial a um estado existente", () => {
    const action = new EditStatesAction<TestState>([{ id: "a", value: 42 }]);
    const result = action.execute({ a: { id: "a", value: 1 } });
    expect(result.a).toEqual({ id: "a", value: 42 });
  });

  test("ignora silenciosamente um edit para um id que não existe", () => {
    const action = new EditStatesAction<TestState>([{ id: "missing", value: 1 }]);
    const before = { a: { id: "a", value: 1 } };
    const result = action.execute(before);
    expect(result).toEqual(before);
  });

  test("undo reverte ao estado anterior", () => {
    const action = new EditStatesAction<TestState>([{ id: "a", value: 42 }]);
    const before = { a: { id: "a", value: 1 } };
    const after = action.execute(before);
    expect(action.undo(after)).toEqual(before);
  });
});

describe("RemoveStatesAction", () => {
  test("remove os estados com os ids indicados", () => {
    const action = new RemoveStatesAction<TestState>(["a"]);
    const result = action.execute({
      a: { id: "a", value: 1 },
      b: { id: "b", value: 2 },
    });
    expect(result).toEqual({ b: { id: "b", value: 2 } });
  });

  test("não quebra ao remover um id que não existe", () => {
    const action = new RemoveStatesAction<TestState>(["missing"]);
    const before = { a: { id: "a", value: 1 } };
    expect(action.execute(before)).toEqual(before);
  });

  test("undo reverte ao estado anterior", () => {
    const action = new RemoveStatesAction<TestState>(["a"]);
    const before = { a: { id: "a", value: 1 }, b: { id: "b", value: 2 } };
    const after = action.execute(before);
    expect(action.undo(after)).toEqual(before);
  });
});
