import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import useStageInteraction from "./useStageInteraction";

const gestureHarness = vi.hoisted(() => ({ handlers: null as any }));

vi.mock("react-use-gesture", () => ({
  useGesture: (handlers: any) => {
    gestureHarness.handlers = handlers;
  },
}));

vi.mock("../contexts/KeyboardContext", () => ({
  useBlur: () => undefined,
  useKeyboard: () => undefined,
}));

vi.mock("normalize-wheel", () => ({
  default: (event: { pixelY: number }) => ({ pixelY: event.pixelY }),
}));

type Point = { x: number; y: number };

type FakeStage = ReturnType<typeof createStage>;

function createStage(initialPosition: Point, pointer: Point) {
  let position = initialPosition;
  return {
    draw: vi.fn(),
    getPointerPosition: vi.fn(() => pointer),
    position: vi.fn((nextPosition?: Point) => {
      if (nextPosition) {
        position = nextPosition;
      }
      return position;
    }),
    x: () => position.x,
    y: () => position.y,
  };
}

function mountHook(
  stage: FakeStage,
  canvas: HTMLCanvasElement,
  gesture: { onWheel?: (props: any) => void; onDrag?: (props: any) => void }
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const stageTranslateRef = { current: stage.position() };
  const stageRef = { current: stage };
  const layerRef = {
    current: { getCanvas: () => ({ _canvas: canvas }) },
  };
  const onStageScaleChange = vi.fn();

  function Harness() {
    useStageInteraction(
      stageRef as any,
      1,
      onStageScaleChange,
      stageTranslateRef as any,
      layerRef as any,
      10,
      { left: "move", right: "none" },
      false,
      gesture as any
    );
    return null;
  }

  act(() => {
    ReactDOM.render(<Harness />, container);
  });

  return {
    onStageScaleChange,
    stageTranslateRef,
    unmount: () =>
      act(() => {
        ReactDOM.unmountComponentAtNode(container);
        container.remove();
      }),
  };
}

describe("useStageInteraction", () => {
  beforeEach(() => {
    gestureHarness.handlers = null;
  });

  it("zooms around the pointer and forwards the wheel gesture", () => {
    const canvas = document.createElement("canvas");
    const stage = createStage({ x: 20, y: 30 }, { x: 120, y: 230 });
    const forwarded = vi.fn();
    const harness = mountHook(stage, canvas, { onWheel: forwarded });
    const nextScale = 1 + 100 / window.innerHeight;
    const expectedPosition = {
      x: 120 - (120 - 20) * nextScale,
      y: 230 - (230 - 30) * nextScale,
    };
    const props = { event: { target: canvas, pixelY: -100 }, last: false };

    act(() => {
      gestureHarness.handlers.onWheelStart({ event: props.event });
      gestureHarness.handlers.onWheel(props);
    });

    expect(stage.position).toHaveBeenLastCalledWith(expectedPosition);
    expect(harness.stageTranslateRef.current).toEqual(expectedPosition);
    expect(harness.onStageScaleChange).toHaveBeenCalledWith(nextScale);
    expect(forwarded).toHaveBeenCalledWith(props);
    harness.unmount();
  });

  it("pans from the stage's live position and forwards the drag gesture", () => {
    const canvas = document.createElement("canvas");
    const stage = createStage({ x: 12, y: 34 }, { x: 0, y: 0 });
    const forwarded = vi.fn();
    const harness = mountHook(stage, canvas, { onDrag: forwarded });
    const props = { delta: [8, -5], pinching: false, buttons: 1 };

    act(() => {
      gestureHarness.handlers.onDragStart({ event: { target: canvas } });
      gestureHarness.handlers.onDrag(props);
    });

    expect(stage.position).toHaveBeenLastCalledWith({ x: 20, y: 29 });
    expect(stage.draw).toHaveBeenCalledTimes(1);
    expect(harness.stageTranslateRef.current).toEqual({ x: 20, y: 29 });
    expect(forwarded).toHaveBeenCalledWith(props);
    harness.unmount();
  });
});
