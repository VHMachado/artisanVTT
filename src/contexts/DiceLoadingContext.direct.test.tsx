import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it } from "vitest";

import { useDiceLoading } from "./DiceLoadingContext";

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(element, container);
  });
  return () => {
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
  };
}

describe("useDiceLoading", () => {
  it("starts with no dice meshes loading, no provider boundary needed", () => {
    let hook: ReturnType<typeof useDiceLoading> | undefined;
    function Reader() {
      hook = useDiceLoading();
      return null;
    }
    const unmount = mount(<Reader />);

    expect(hook?.isLoading).toBe(false);
    unmount();
  });

  it("stays loading until every concurrent asset load finishes", () => {
    let hook: ReturnType<typeof useDiceLoading> | undefined;
    function Reader() {
      hook = useDiceLoading();
      return null;
    }
    const unmount = mount(<Reader />);

    act(() => {
      hook!.assetLoadStart();
      hook!.assetLoadStart();
    });
    expect(hook!.isLoading).toBe(true);

    act(() => hook!.assetLoadFinish());
    expect(hook!.isLoading).toBe(true);

    act(() => hook!.assetLoadFinish());
    expect(hook!.isLoading).toBe(false);

    unmount();
  });
});
