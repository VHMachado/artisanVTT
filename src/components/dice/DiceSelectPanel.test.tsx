import { describe, expect, test, vi } from "vitest";
import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom";

import DiceSelectPanel from "./DiceSelectPanel";

describe("DiceSelectPanel", () => {
  test("keeps sharing control without the obsolete dice-style picker", () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const container = document.createElement("div");
    const onShareDiceChange = vi.fn();
    act(() => {
      ReactDOM.render(
        <DiceSelectPanel
          counts={{}}
          onAdd={vi.fn()}
          onRemove={vi.fn()}
          loading={false}
          shareDice={false}
          onShareDiceChange={onShareDiceChange}
        />,
        container
      );
    });

    const share = container.querySelector(
      'button[aria-label="Compartilhar rolagens"]'
    ) as HTMLButtonElement | null;
    expect(share).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Select Dice Style"]')
    ).toBeNull();
    act(() => share?.click());
    expect(onShareDiceChange).toHaveBeenCalledWith(true);

    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
  });
});
