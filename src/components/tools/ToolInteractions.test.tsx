import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

class FakeEmitter {
  private listeners = new Map<string, Set<(event: any) => void>>();

  on(event: string, listener: (event: any) => void) {
    const listeners = this.listeners.get(event) || new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: (event: any) => void) {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, value: any) {
    this.listeners.get(event)?.forEach((listener) => listener(value));
  }
}

let emitter: FakeEmitter;
const mapImage = { width: () => 100, height: () => 50 };

vi.mock("../../contexts/MapInteractionContext", () => ({
  useInteractionEmitter: () => emitter,
  useMapWidth: () => 100,
  useMapHeight: () => 50,
}));
vi.mock("../../contexts/MapStageContext", () => ({
  useMapStage: () => ({ current: { findOne: () => mapImage } }),
}));
vi.mock("../../contexts/GridContext", () => ({
  useGrid: () => ({ measurement: { type: "manhattan", scale: "5ft" } }),
  useGridCellNormalizedSize: () => ({ x: 0.1, y: 0.1 }),
  useGridCellPixelSize: () => ({ width: 10, height: 10 }),
  useGridOffset: () => ({ x: 0, y: 0 }),
  useGridStrokeWidth: () => 3,
}));
vi.mock("../../hooks/useGridSnapping", () => ({ default: () => (position: any) => position }));
vi.mock("../../helpers/konva", () => ({
  getRelativePointerPositionNormalized: () => ({ x: 0.25, y: 0.5 }),
  getRelativePointerPosition: () => ({ x: 40, y: 20 }),
}));
vi.mock("../../helpers/grid", () => ({
  parseGridScale: () => ({ value: 5, unit: "ft" }),
  gridDistance: () => 7,
}));
vi.mock("react-konva", () => ({ Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../konva/Pointer", () => ({
  default: ({ position }: { position: { x: number; y: number } }) => (
    <output data-pointer={`${position.x},${position.y}`} />
  ),
}));
vi.mock("../konva/Ruler", () => ({
  default: ({ length, points }: { length: number; points: Array<{ x: number; y: number }> }) => (
    <output data-ruler={`${length}:${points.map((point) => `${point.x},${point.y}`).join(";")}`} />
  ),
}));

import MeasureTool from "./MeasureTool";
import PointerTool from "./PointerTool";

const roots: HTMLElement[] = [];

afterEach(() => {
  while (roots.length) {
    const root = roots.pop() as HTMLElement;
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    root.remove();
  }
});

function mount(element: React.ReactElement) {
  emitter = new FakeEmitter();
  const root = document.createElement("div");
  document.body.appendChild(root);
  roots.push(root);
  act(() => {
    ReactDOM.render(element, root);
  });
  return root;
}

const rightBound = { left: "move", right: "pointer" } as const;

describe("map tool interaction contracts", () => {
  it("drives pointer callbacks from a right-bound drag with normalized coordinates", () => {
    const down = vi.fn();
    const move = vi.fn();
    const up = vi.fn();
    const root = mount(
      <PointerTool
        bindings={rightBound}
        position={{ x: 0.1, y: 0.2 }}
        visible
        color="red"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
      />
    );

    act(() => {
      emitter.emit("dragStart", { buttons: 2 });
      emitter.emit("drag", { buttons: 2 });
      emitter.emit("dragEnd", { buttons: 0, event: { button: 2 } });
    });

    expect(down).toHaveBeenCalledWith({ x: 0.25, y: 0.5 });
    expect(move).toHaveBeenCalledWith({ x: 0.25, y: 0.5 });
    expect(up).toHaveBeenCalledWith({ x: 0.25, y: 0.5 });
    expect(root.querySelector("[data-pointer]")).toHaveAttribute("data-pointer", "10,10");
  });

  it("shows a ruler while the right-bound measure drag is active and clears it on release", () => {
    const root = mount(
      <MeasureTool
        bindings={{ left: "move", right: "measure" }}
        map={{ snapToGrid: false } as any}
      />
    );

    act(() => emitter.emit("dragStart", { buttons: 2 }));
    act(() => emitter.emit("drag", { buttons: 2 }));
    expect(root.querySelector("[data-ruler]")).toHaveAttribute("data-ruler", "7:0.4,0.4;0.4,0.4");

    act(() => emitter.emit("dragEnd", { buttons: 0, event: { button: 2 } }));
    expect(root.querySelector("[data-ruler]")).toBeNull();
  });
});
