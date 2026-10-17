import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it } from "vitest";

import { useStageScale, useSetStageScale } from "./MapInteractionContext";

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

describe("map interaction selectors", () => {
  it("reads and updates stage scale without a provider boundary", () => {
    let stageScale = 0;

    function Reader() {
      const setStageScale = useSetStageScale();
      stageScale = useStageScale();
      React.useEffect(() => {
        setStageScale(2);
      }, [setStageScale]);
      return null;
    }

    const unmount = mount(<Reader />);

    expect(stageScale).toBe(2);
    unmount();
  });
});
