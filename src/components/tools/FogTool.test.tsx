import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  cut: (state: any) => state,
  fogViews: [] as any[],
  keyboardDown: undefined as ((event: any) => void) | undefined,
  subtract: (state: any) => state,
}));

class FakeEmitter {
  listeners = new Map<string, Set<(payload: any) => void>>();

  on(event: string, listener: (payload: any) => void) {
    const listeners = this.listeners.get(event) || new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: (payload: any) => void) {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, payload: any) {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }
}

let emitter: FakeEmitter;
let pointer = { x: 10, y: 20 };
const stageHandlers = new Map<string, (event: any) => void>();
const image = { width: () => 100, height: () => 100 };
const stage = {
  findOne: () => image,
  on: vi.fn((event: string, listener: (payload: any) => void) => stageHandlers.set(event, listener)),
  off: vi.fn((event: string) => stageHandlers.delete(event)),
};

vi.mock("shortid", () => ({ default: { generate: () => "fog-draft" } }));
vi.mock("use-image", () => ({ default: () => [null] }));
vi.mock("color", () => ({ default: class { alpha() { return this; } string() { return "rgba(0,0,0,0.5)"; } } }));
vi.mock("react-konva", () => ({ Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, Line: () => <span /> }));
vi.mock("../../contexts/MapInteractionContext", () => ({
  useDebouncedStageScale: () => 1,
  useMapWidth: () => 100,
  useMapHeight: () => 100,
  useInteractionEmitter: () => emitter,
}));
vi.mock("../../contexts/MapStageContext", () => ({ useMapStage: () => ({ current: stage }) }));
vi.mock("../../contexts/GridContext", () => ({
  useGrid: () => ({}),
  useGridCellPixelSize: () => ({ width: 10, height: 10 }),
  useGridCellNormalizedSize: () => ({ x: 0.1, y: 0.1 }),
  useGridStrokeWidth: () => 1,
  useGridCellPixelOffset: () => ({ x: 0, y: 0 }),
  useGridOffset: () => ({ x: 0, y: 0 }),
  useGridSnappingSensitivity: () => 0,
}));
vi.mock("../../contexts/KeyboardContext", () => ({
  useKeyboard: (down: (event: any) => void) => { testState.keyboardDown = down; },
}));
vi.mock("../../helpers/konva", () => ({ getRelativePointerPosition: () => pointer }));
vi.mock("../../helpers/mouseBindings", () => ({ isToolBound: () => true, toolForAnyButtonEvent: (event: { tool: string }) => event.tool }));
vi.mock("../../helpers/fog", () => ({
  mergeFogShapes: (shapes: any[]) => shapes,
  getFogShapesBoundingBoxes: () => [],
  getGuidesFromBoundingBoxes: () => [],
  getGuidesFromGridCell: () => [],
  findBestGuides: () => [],
}));
vi.mock("../../hooks/useSetting", () => ({ default: (key: string) => [key === "fog.showGuides" ? true : 0.5] }));
vi.mock("../../actions/SubtractFogAction", () => ({
  default: class { execute(state: any) { return testState.subtract(state); } },
}));
vi.mock("../../actions/CutFogAction", () => ({
  default: class { execute(state: any) { return testState.cut(state); } },
}));
vi.mock("../konva/Fog", () => ({
  default: (props: any) => { testState.fogViews.push(props); return <output data-fog-shape />; },
}));
vi.mock("../konva/Tick", () => ({ default: () => <output data-tick /> }));

import FogTool from "./FogTool";

const roots: HTMLElement[] = [];

afterEach(() => {
  while (roots.length) {
    const root = roots.pop() as HTMLElement;
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    root.remove();
  }
  stageHandlers.clear();
  stage.on.mockClear();
  stage.off.mockClear();
  testState.cut = (state) => state;
  testState.fogViews = [];
  testState.keyboardDown = undefined;
  testState.subtract = (state) => state;
});

function mount(overrides: Partial<React.ComponentProps<typeof FogTool>> = {}) {
  emitter = new FakeEmitter();
  pointer = { x: 10, y: 20 };
  const root = document.createElement("div");
  document.body.appendChild(root);
  roots.push(root);
  const props = {
    map: { snapToGrid: false } as any,
    shapes: [],
    onShapesAdd: vi.fn(),
    onShapesCut: vi.fn(),
    onShapesRemove: vi.fn(),
    onShapesEdit: vi.fn(),
    onShapeError: vi.fn(),
    bindings: { left: "fog", right: "move" } as const,
    toolSettings: { type: "brush", multilayer: true, preview: false, useFogCut: false } as const,
    editable: true,
    ...overrides,
  };
  act(() => {
    ReactDOM.render(<FogTool {...props} />, root);
  });
  return { root, props };
}

describe("FogTool", () => {
  it("adds a finalized freehand fog shape after a bound brush drag", () => {
    const added = vi.fn();
    mount({ onShapesAdd: added });

    act(() => emitter.emit("dragStart", { tool: "fog" }));
    pointer = { x: 40, y: 50 };
    act(() => emitter.emit("drag", { tool: "fog" }));
    act(() => emitter.emit("dragEnd", { tool: "fog" }));

    expect(added).toHaveBeenCalledWith([
      expect.objectContaining({ id: "fog-draft", color: "black", visible: true }),
    ]);
    const points = added.mock.calls[0][0][0].data.points;
    expect(points).toEqual([{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }]);
  });

  it("builds rectangle and polygon fog using the staged pointer points", () => {
    const rectangle = vi.fn();
    mount({ onShapesAdd: rectangle, toolSettings: { type: "rectangle", multilayer: true, preview: false, useFogCut: false } });
    act(() => emitter.emit("dragStart", { tool: "fog" }));
    pointer = { x: 40, y: 50 };
    act(() => emitter.emit("drag", { tool: "fog" }));
    act(() => emitter.emit("dragEnd", { tool: "fog" }));
    expect(rectangle.mock.calls[0][0][0].data.points).toEqual([
      { x: 0.1, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.4, y: 0.5 }, { x: 0.1, y: 0.5 },
    ]);

    const polygon = vi.fn();
    mount({ onShapesAdd: polygon, toolSettings: { type: "polygon", multilayer: true, preview: false, useFogCut: false } });
    const click = stageHandlers.get("click tap") as (event: any) => void;
    const move = stageHandlers.get("mousemove touchmove") as () => void;
    act(() => click({ tool: "fog" }));
    pointer = { x: 40, y: 20 };
    act(() => { move(); click({ tool: "fog" }); });
    pointer = { x: 40, y: 50 };
    act(() => { move(); click({ tool: "fog" }); });
    act(() => testState.keyboardDown?.({ key: "Enter" }));
    expect(polygon.mock.calls[0][0][0].data.points).toEqual([
      { x: 0.1, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.4, y: 0.5 },
    ]);
  });

  it("keeps multilayer additions separate and reports blocked single-layer additions", () => {
    const subtract = vi.fn((state) => state);
    testState.subtract = subtract;
    const layered = vi.fn();
    mount({ shapes: [{ id: "old", type: "fog", color: "black", visible: true, strokeWidth: 0.5, data: { points: [], holes: [] } }], onShapesAdd: layered });
    act(() => emitter.emit("dragStart", { tool: "fog" }));
    act(() => emitter.emit("dragEnd", { tool: "fog" }));
    expect(layered).toHaveBeenCalledTimes(1);
    expect(subtract).not.toHaveBeenCalled();

    testState.subtract = () => ({});
    const blocked = vi.fn();
    const error = vi.fn();
    mount({ onShapesAdd: blocked, onShapeError: error, toolSettings: { type: "brush", multilayer: false, preview: false, useFogCut: false } });
    act(() => emitter.emit("dragStart", { tool: "fog" }));
    act(() => emitter.emit("dragEnd", { tool: "fog" }));
    expect(blocked).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("Fog already placed");
  });

  it("reports an ineffective fog cut and applies toggle or remove to hovered shapes", () => {
    const shape = { id: "old", type: "fog" as const, color: "black" as const, visible: true, strokeWidth: 0.5, data: { points: [], holes: [] } };
    const error = vi.fn();
    const cut = vi.fn();
    mount({ shapes: [shape], onShapesCut: cut, onShapeError: error, toolSettings: { type: "brush", multilayer: true, preview: false, useFogCut: true } });
    act(() => emitter.emit("dragStart", { tool: "fog" }));
    act(() => emitter.emit("dragEnd", { tool: "fog" }));
    expect(cut).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("No fog to cut");

    testState.fogViews = [];
    const edit = vi.fn();
    mount({ shapes: [shape], onShapesEdit: edit, toolSettings: { type: "toggle", multilayer: true, preview: false, useFogCut: false } });
    const toggleViews = testState.fogViews.filter((view) => view.fog.id === "old");
    act(() => toggleViews[toggleViews.length - 1].onMouseDown({ tool: "fog" }));
    const releasedToggleViews = testState.fogViews.filter((view) => view.fog.id === "old" && view.onMouseUp);
    act(() => releasedToggleViews[releasedToggleViews.length - 1].onMouseUp({ tool: "fog" }));
    expect(edit).toHaveBeenCalledWith([{ id: "old", visible: false }]);

    testState.fogViews = [];
    const remove = vi.fn();
    mount({ shapes: [shape], onShapesRemove: remove, toolSettings: { type: "remove", multilayer: true, preview: false, useFogCut: false } });
    const removeViews = testState.fogViews.filter((view) => view.fog.id === "old");
    act(() => removeViews[removeViews.length - 1].onMouseDown({ tool: "fog" }));
    const releasedRemoveViews = testState.fogViews.filter((view) => view.fog.id === "old" && view.onMouseUp);
    act(() => releasedRemoveViews[releasedRemoveViews.length - 1].onMouseUp({ tool: "fog" }));
    expect(remove).toHaveBeenCalledWith(["old"]);
  });

  it("does not subscribe editable drawing listeners in preview mode", () => {
    mount({ editable: false, toolSettings: { type: "brush", multilayer: true, preview: true, useFogCut: false } });

    expect(emitter.listeners.size).toBe(0);
    expect(stage.on).not.toHaveBeenCalled();
  });
});
