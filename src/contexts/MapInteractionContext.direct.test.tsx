import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it } from "vitest";

import {
  useDebouncedStageScale,
  useStageScale,
  useSetStageScale,
} from "./MapInteractionContext";

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

  /**
   * Ruler mounts fresh on every measure gesture, so its very first render
   * happens long before the 200ms debounce settles. Reporting 1:1 there
   * made the label counter-scale by 1/1 and flash enormous on a zoomed-in
   * map.
   */
  it("reports the live zoom on first render instead of 1:1", () => {
    let debounced = 0;

    function Zoom() {
      const setStageScale = useSetStageScale();
      React.useEffect(() => {
        setStageScale(3);
      }, [setStageScale]);
      return null;
    }

    function Reader() {
      debounced = useDebouncedStageScale();
      return null;
    }

    const unmountZoom = mount(<Zoom />);
    const unmountReader = mount(<Reader />);

    expect(debounced).toBe(3);
    unmountReader();
    unmountZoom();
  });
});
