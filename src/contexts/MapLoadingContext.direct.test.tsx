import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it } from "vitest";

import { useMapLoading } from "./MapLoadingContext";

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

describe("useMapLoading", () => {
  it("starts idle with no provider boundary needed", () => {
    let hook: ReturnType<typeof useMapLoading> | undefined;
    function Reader() {
      hook = useMapLoading();
      return null;
    }
    const unmount = mount(<Reader />);

    expect(hook?.isLoading).toBe(false);
    expect(hook?.loadingProgressRef.current).toBe(0);
    unmount();
  });

  it("tracks progress across multiple assets and finishes at 1", () => {
    let hook: ReturnType<typeof useMapLoading> | undefined;
    function Reader() {
      hook = useMapLoading();
      return null;
    }
    const unmount = mount(<Reader />);

    act(() => {
      hook!.assetLoadStart("a");
      hook!.assetLoadStart("b");
    });
    expect(hook!.isLoading).toBe(true);

    act(() => {
      hook!.assetProgressUpdate({ id: "a", count: 1, total: 1 });
    });
    expect(hook!.loadingProgressRef.current).toBe(0.5);

    act(() => {
      hook!.assetProgressUpdate({ id: "b", count: 1, total: 1 });
    });
    expect(hook!.loadingProgressRef.current).toBe(1);
    expect(hook!.isLoading).toBe(false);

    unmount();
  });
});
