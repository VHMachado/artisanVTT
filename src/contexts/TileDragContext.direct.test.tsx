import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it } from "vitest";

import { useTileDragId } from "./TileDragContext";

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

describe("tile drag selectors", () => {
  it("reads the idle drag state without a provider boundary", () => {
    let dragId: string | null | undefined;

    function Reader() {
      dragId = useTileDragId();
      return null;
    }

    const unmount = mount(<Reader />);

    expect(dragId).toBeNull();
    unmount();
  });
});
