import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import useDebounce from "./useDebounce";
import usePreventContextMenu from "./usePreventContextMenu";
import usePreventOverscroll from "./usePreventOverscroll";
import usePreventSelect from "./usePreventSelect";
import usePreventTouch from "./usePreventTouch";
import usePrevious from "./usePrevious";

type Unmount = () => void;

function mount(element: React.ReactElement): Unmount {
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

afterEach(() => {
  vi.useRealTimers();
  document.body.className = "";
});

describe("generic interaction hooks", () => {
  it("debounces updates and cancels a superseded timer", () => {
    vi.useFakeTimers();
    const received: Array<string | undefined> = [];
    let rerender: (value: string) => void = () => {};

    function Harness({ value }: { value: string }) {
      received.push(useDebounce(value, 100));
      return null;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    rerender = (value) => {
      act(() => {
        ReactDOM.render(<Harness value={value} />, container);
      });
    };

    rerender("first");
    act(() => {
      vi.advanceTimersByTime(60);
    });
    rerender("second");
    act(() => {
      vi.advanceTimersByTime(99);
    });
    expect(received).not.toContain("second");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(received.at(-1)).toBe("second");

    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
  });

  it("returns the preceding rendered value", () => {
    const values: string[] = [];
    let rerender: (value: string) => void = () => {};

    function Harness({ value }: { value: string }) {
      values.push(usePrevious(value));
      return null;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    rerender = (value) => {
      act(() => {
        ReactDOM.render(<Harness value={value} />, container);
      });
    };

    rerender("before");
    rerender("after");
    expect(values).toEqual(["before", "before"]);

    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
  });

  it.each([
    ["contextmenu", usePreventContextMenu],
    ["wheel", usePreventOverscroll],
    ["touchstart", usePreventTouch],
  ])("prevents %s only while mounted", (eventName, usePrevention) => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const ref = { current: element } as React.MutableRefObject<HTMLElement>;

    function Harness() {
      usePrevention(ref);
      return null;
    }

    const unmount = mount(<Harness />);
    const duringMount = new Event(eventName, { cancelable: true });
    element.dispatchEvent(duringMount);
    expect(duringMount.defaultPrevented).toBe(true);

    unmount();
    const afterUnmount = new Event(eventName, { cancelable: true });
    element.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
    element.remove();
  });

  it("clears selection and toggles the no-select body class", () => {
    const removeAllRanges = vi.fn();
    vi.spyOn(window, "getSelection").mockReturnValue({ removeAllRanges } as unknown as Selection);
    let controls: ReturnType<typeof usePreventSelect> | undefined;

    function Harness() {
      controls = usePreventSelect();
      return null;
    }

    const unmount = mount(<Harness />);
    act(() => controls?.[0]());
    expect(removeAllRanges).toHaveBeenCalledOnce();
    expect(document.body).toHaveClass("no-select");

    act(() => controls?.[1]());
    expect(document.body).not.toHaveClass("no-select");
    unmount();
  });
});
