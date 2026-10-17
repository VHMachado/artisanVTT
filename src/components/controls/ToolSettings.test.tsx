import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

let keyboardListener: ((event: KeyboardEvent) => void) | undefined;

vi.mock("../../contexts/KeyboardContext", () => ({
  useKeyboard: (listener: (event: KeyboardEvent) => void) => {
    keyboardListener = listener;
  },
}));

vi.mock("react-media", () => ({ useMedia: () => false }));

vi.mock("../RadioIconButton", () => ({
  default: ({
    title,
    children,
    onClick,
    disabled,
  }: {
    title: string;
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button aria-label={title} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("../map/MapMenu", () => ({
  default: ({
    children,
    isOpen,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
  }) => (isOpen ? <div data-map-menu="open">{children}</div> : null),
}));

import FogToolSettings from "./FogToolSettings";
import PointerToolSettings from "./PointerToolSettings";
import SelectToolSettings from "./SelectToolSettings";
import ColorControl from "./shared/ColorControl";
import EraseAllButton from "./shared/EraseAllButton";

const mounted: HTMLElement[] = [];

afterEach(() => {
  while (mounted.length > 0) {
    const container = mounted.pop() as HTMLElement;
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
  }
  keyboardListener = undefined;
});

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  mounted.push(container);
  act(() => {
    ReactDOM.render(element, container);
  });
  return container;
}

function press(key: string) {
  act(() => {
    keyboardListener?.(new KeyboardEvent("keydown", { key }));
  });
}

describe("tool settings", () => {
  it("routes fog shortcuts, but preview leaves edit controls disabled", () => {
    const onSettingChange = vi.fn();
    const container = mount(
      <FogToolSettings
        settings={{ type: "brush", multilayer: false, preview: true, useFogCut: false }}
        onSettingChange={onSettingChange}
      />
    );

    press("r");
    expect(onSettingChange).toHaveBeenCalledWith({ type: "rectangle" });

    const toggle = container.querySelector(
      '[aria-label="Toggle Fog (T)"]'
    ) as HTMLButtonElement;
    const cut = container.querySelector(
      '[aria-label="Enable Fog Cutting (C)"]'
    ) as HTMLButtonElement;
    expect(toggle).toBeDisabled();
    expect(cut).toBeDisabled();

    act(() => toggle.click());
    expect(onSettingChange).toHaveBeenCalledTimes(1);
  });

  it("preserves the select keyboard choices and tool clicks", () => {
    const onSettingChange = vi.fn();
    const container = mount(
      <SelectToolSettings settings={{ type: "rectangle" }} onSettingChange={onSettingChange} />
    );

    press("l");
    expect(onSettingChange).toHaveBeenCalledWith({ type: "path" });

    act(() => {
      (container.querySelector('[aria-label="Rectangle Selection (R)"]') as HTMLButtonElement).click();
    });
    expect(onSettingChange).toHaveBeenLastCalledWith({ type: "rectangle" });
  });

  it("omits excluded colors and closes the palette after choosing a color", () => {
    const onColorChange = vi.fn();
    const container = mount(
      <ColorControl color="blue" onColorChange={onColorChange} exclude={["black", "primary"]} />
    );

    act(() => {
      (container.querySelector('[aria-label="Brush Color blue"]') as HTMLElement).click();
    });
    expect(container.querySelector("[data-map-menu='open']")).not.toBeNull();
    expect(container.querySelector('[aria-label="Brush Color black"]')).toBeNull();
    expect(container.querySelector('[aria-label="Brush Color primary"]')).toBeNull();

    act(() => {
      (container.querySelector('[aria-label="Brush Color yellow"]') as HTMLElement).click();
    });
    expect(onColorChange).toHaveBeenCalledWith("yellow");
    expect(container.querySelector("[data-map-menu='open']")).toBeNull();
  });

  it("keeps the pointer palette exclusions and only erases after confirmation", () => {
    const onSettingChange = vi.fn();
    const pointer = mount(
      <PointerToolSettings settings={{ color: "red" }} onSettingChange={onSettingChange} />
    );
    act(() => {
      (pointer.querySelector('[aria-label="Brush Color red"]') as HTMLElement).click();
    });
    expect(pointer.querySelector('[aria-label="Brush Color white"]')).toBeNull();
    act(() => {
      (pointer.querySelector('[aria-label="Brush Color teal"]') as HTMLElement).click();
    });
    expect(onSettingChange).toHaveBeenCalledWith({ color: "teal" });

    const onToolAction = vi.fn();
    const erase = mount(<EraseAllButton disabled={false} onToolAction={onToolAction} />);
    act(() => {
      (erase.querySelector('[aria-label="Erase All"]') as HTMLButtonElement).click();
    });
    expect(onToolAction).not.toHaveBeenCalled();
    expect(erase.querySelector("[data-map-menu='open']")).not.toBeNull();
    act(() => {
      (erase.querySelector("[data-map-menu='open'] button") as HTMLButtonElement).click();
    });
    expect(onToolAction).toHaveBeenCalledWith("eraseAll");
  });
});
