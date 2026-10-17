import React, { useState } from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

class FakeEmitter {
  listeners = new Map<string, Set<(event: any) => void>>();

  on(event: string, listener: (event: any) => void) {
    const listeners = this.listeners.get(event) || new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: (event: any) => void) {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, payload: any) {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }
}

let emitter: FakeEmitter;
let pointer = { x: 10, y: 20 };
const token = (id: string) => ({ id: () => id, position: () => ({ x: 20, y: 30 }) });
const stage = {
  findOne: () => ({ width: () => 100, height: () => 100 }),
  find: () => [{ children: [token("token-a"), token("disabled-token")] }],
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock("../../contexts/GridContext", () => ({ useGridCellNormalizedSize: () => ({ x: 0.1, y: 0.1 }) }));
vi.mock("../../contexts/MapInteractionContext", () => ({
  useDebouncedStageScale: () => 1,
  useInteractionEmitter: () => emitter,
  useMapHeight: () => 100,
  useMapWidth: () => 100,
}));
vi.mock("../../contexts/MapStageContext", () => ({ useMapStage: () => ({ current: stage }) }));
vi.mock("../../helpers/geometry", () => ({
  getDefaultShapeData: (_: string, point: { x: number; y: number }) => ({ x: point.x, y: point.y, width: 0, height: 0 }),
  getUpdatedShapeData: (_: string, shape: any, point: { x: number; y: number }) => ({ ...shape, width: point.x - shape.x, height: point.y - shape.y }),
  simplifyPoints: (points: unknown[]) => points,
}));
vi.mock("../../helpers/konva", () => ({
  getRelativePointerPosition: () => pointer,
  scaleAndFlattenPoints: (points: unknown[]) => points,
}));
vi.mock("../../helpers/mouseBindings", () => ({
  isToolBound: () => true,
  toolForAnyButtonEvent: (event: { tool: string }) => event.tool,
}));
vi.mock("../../helpers/selection", () => ({ getSelectionPoints: () => [{ x: 0, y: 0 }] }));
vi.mock("../../helpers/token", () => ({ Intersection: class { intersects() { return true; } } }));
vi.mock("react-konva", () => ({ Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../konva/Selection", () => ({ default: () => <output data-selection-overlay /> }));

import SelectTool from "./SelectTool";

const roots: HTMLElement[] = [];

afterEach(() => {
  while (roots.length) {
    const root = roots.pop() as HTMLElement;
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    root.remove();
  }
  stage.on.mockReset();
  stage.off.mockReset();
});

function Harness({ type }: { type: "rectangle" | "path" }) {
  const [selection, setSelection] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <>
      <SelectTool
        bindings={{ left: "select", right: "move" }}
        toolSettings={{ type }}
        onSelectionItemsChange={vi.fn()}
        selection={selection}
        onSelectionChange={setSelection}
        onSelectionMenuOpen={setMenuOpen}
        onSelectionDragStart={vi.fn()}
        onSelectionDragEnd={vi.fn()}
        disabledTokens={{ "disabled-token": true }}
        map={{} as any}
      />
      <output data-selection={selection ? JSON.stringify(selection) : ""} data-menu-open={String(menuOpen)} />
    </>
  );
}

function mount(type: "rectangle" | "path") {
  emitter = new FakeEmitter();
  pointer = { x: 10, y: 20 };
  const root = document.createElement("div");
  document.body.appendChild(root);
  roots.push(root);
  act(() => {
    ReactDOM.render(<Harness type={type} />, root);
  });
  return root;
}

function selectionFrom(root: HTMLElement) {
  return JSON.parse(root.querySelector("output[data-selection]")?.getAttribute("data-selection") || "null");
}

describe("SelectTool marquee", () => {
  it("builds a rectangle marquee and excludes disabled tokens from its hit set", () => {
    const root = mount("rectangle");

    act(() => emitter.emit("dragStart", { tool: "select" }));
    pointer = { x: 50, y: 60 };
    act(() => emitter.emit("drag", { tool: "select" }));
    act(() => emitter.emit("dragEnd", { tool: "select" }));

    const selection = selectionFrom(root);
    expect(selection).toMatchObject({
      type: "rectangle",
      items: [{ id: "token-a", type: "token" }],
      data: { x: 0.1, y: 0.2 },
    });
    expect(selection.data.width).toBeCloseTo(0.4);
    expect(selection.data.height).toBeCloseTo(0.4);
    expect(root.querySelector("output[data-selection]")).toHaveAttribute("data-menu-open", "true");
  });

  it("begins a path marquee with its normalized pointer position", () => {
    const root = mount("path");

    act(() => emitter.emit("dragStart", { tool: "select" }));

    expect(selectionFrom(root)).toEqual({
      type: "path",
      items: [],
      data: { points: [{ x: 0.1, y: 0.2 }] },
      x: 0,
      y: 0,
    });
  });
});
