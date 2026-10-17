import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";

import AlphaBlendToggle from "./AlphaBlendToggle";
import FogCutToggle from "./FogCutToggle";
import FogPreviewToggle from "./FogPreviewToggle";
import MultilayerToggle from "./MultilayerToggle";
import ShapeFillToggle from "./ShapeFillToggle";
import ToolToggle from "./ToolToggle";

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(element, container);
  });
  return {
    container,
    unmount: () => {
      act(() => {
        ReactDOM.unmountComponentAtNode(container);
      });
      container.remove();
    },
  };
}

describe("ToolToggle", () => {
  it("uses the active action label and inverses the setting on click", () => {
    const onChange = vi.fn();
    const { container, unmount } = mount(
      <ToolToggle
        active
        onChange={onChange}
        enableLabel="Enable preview"
        disableLabel="Disable preview"
        enabledIcon={<span>on</span>}
        disabledIcon={<span>off</span>}
      />
    );

    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button).toHaveAttribute("aria-label", "Disable preview");
    expect(button.textContent).toBe("on");
    act(() => button.click());
    expect(onChange).toHaveBeenCalledWith(false);
    unmount();
  });

  it("does not change a disabled setting", () => {
    const onChange = vi.fn();
    const { container, unmount } = mount(
      <ToolToggle
        active={false}
        disabled
        onChange={onChange}
        enableLabel="Enable preview"
        disableLabel="Disable preview"
        enabledIcon={<span>on</span>}
        disabledIcon={<span>off</span>}
      />
    );

    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button).toBeDisabled();
    act(() => button.click());
    expect(onChange).not.toHaveBeenCalled();
    unmount();
  });

  it("keeps the five legacy toggle modules as callable default entrypoints", () => {
    const onChange = vi.fn();
    const { container, unmount } = mount(
      <>
        <AlphaBlendToggle useBlending onBlendingChange={onChange} />
        <ShapeFillToggle useShapeFill onShapeFillChange={onChange} />
        <FogPreviewToggle useFogPreview onFogPreviewChange={onChange} />
        <FogCutToggle useFogCut onFogCutChange={onChange} />
        <MultilayerToggle multilayer onMultilayerChange={onChange} />
      </>
    );

    expect(container.querySelectorAll("button")).toHaveLength(5);
    expect(container.textContent).not.toBeNull();
    unmount();
  });
});
