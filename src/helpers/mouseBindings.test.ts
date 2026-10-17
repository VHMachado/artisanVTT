import { describe, expect, it } from "vitest";

import {
  toolForAnyButtonEvent,
  toolForDragButtons,
  toolForKonvaButton,
} from "./mouseBindings";

const bindings = { left: "measure", right: "fog" } as const;

describe("mouse tool bindings", () => {
  it("decodes drag bitmasks without assigning the middle button", () => {
    expect(toolForDragButtons(0, bindings)).toBe("measure");
    expect(toolForDragButtons(1, bindings)).toBe("measure");
    expect(toolForDragButtons(2, bindings)).toBe("fog");
    expect(toolForDragButtons(4, bindings)).toBeUndefined();
    expect(toolForDragButtons(3, bindings)).toBeUndefined();
  });

  it("uses the released native button when a drag end reports buttons zero", () => {
    expect(
      toolForAnyButtonEvent({ buttons: 0, event: { button: 2 } }, bindings)
    ).toBe("fog");
    expect(
      toolForAnyButtonEvent({ buttons: 0, event: { button: 0 } }, bindings)
    ).toBe("measure");
  });

  it("keeps Konva and touch decoding aligned with their own event shapes", () => {
    expect(toolForKonvaButton(undefined, bindings)).toBe("measure");
    expect(toolForKonvaButton(0, bindings)).toBe("measure");
    expect(toolForKonvaButton(2, bindings)).toBe("fog");
    expect(toolForKonvaButton(1, bindings)).toBeUndefined();
    expect(toolForAnyButtonEvent({ evt: { button: 2 } }, bindings)).toBe("fog");
  });
});
