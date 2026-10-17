import ReactDOM from "react-dom";
import Modal from "react-modal";
import { act } from "react-dom/test-utils";
import { describe, expect, test, vi } from "vitest";

import ErrorBanner from "./banner/ErrorBanner";
import LoadingBar from "./LoadingBar";
import RadioIconButton from "./RadioIconButton";
import Slider from "./Slider";

describe("generic UI primitives", () => {
  test("does not schedule loading-bar frames while loading is idle", () => {
    const container = document.createElement("div");
    const requestAnimationFrame = vi.fn(() => 1);
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

    act(() => {
      ReactDOM.render(
        <LoadingBar isLoading={false} loadingProgressRef={{ current: 0.5 }} />,
        container
      );
    });

    expect(requestAnimationFrame).not.toHaveBeenCalled();

    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    vi.unstubAllGlobals();
  });

  test("shows the slider label while preserving caller pointer handlers", () => {
    const container = document.createElement("div");
    const onMouseDown = vi.fn();

    act(() => {
      ReactDOM.render(
        <Slider
          min={0}
          max={10}
          value={5}
          labelFunc={(value) => `Value ${value}`}
          onMouseDown={onMouseDown}
          readOnly
        />,
        container
      );
    });

    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(onMouseDown).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Value 5");

    act(() => {
      input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      ReactDOM.unmountComponentAtNode(container);
    });
  });

  test("keeps caller sx overrides on selected radio icon buttons", () => {
    const container = document.createElement("div");

    act(() => {
      ReactDOM.render(
        <RadioIconButton title="Map tool" isSelected sx={{ color: "secondary" }}>
          Tool
        </RadioIconButton>,
        container
      );
    });

    expect(container.querySelector("button")).toHaveAttribute("aria-label", "Map tool");
    expect(document.head.textContent).toContain("color:secondary");

    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
  });

  test("shows error details and gives the close affordance its callback", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    Modal.setAppElement(root);
    const onRequestClose = vi.fn();

    act(() => {
      ReactDOM.render(
        <ErrorBanner error={new Error("Connection lost")} onRequestClose={onRequestClose} />,
        root
      );
    });

    expect(document.body.textContent).toContain("Error: Connection lost");
    const closeButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button !== root.querySelector("button") || button.parentElement !== root
    ) as HTMLButtonElement;
    act(() => {
      closeButton.click();
    });
    expect(onRequestClose).toHaveBeenCalledTimes(1);

    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    root.remove();
  });
});
