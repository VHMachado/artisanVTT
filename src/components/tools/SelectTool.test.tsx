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

/** Mirrors just enough of Konva's `Stage` for these tests: `on`/`off`/a
 * way to fire a registered listener, so a test can reproduce Konva's
 * OWN native "click tap" firing independently of (and right after) the
 * custom drag emitter above — see the 2026-10-26 regression test below. */
class FakeStage extends FakeEmitter {
  find() {
    return [{ children: [token("token-a"), token("disabled-token")] }];
  }
  findOne() {
    return { width: () => 100, height: () => 100 };
  }
}

let emitter: FakeEmitter;
let stage: FakeStage;
let pointer = { x: 10, y: 20 };
const token = (id: string) => ({ id: () => id, position: () => ({ x: 20, y: 30 }) });

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
  stage = new FakeStage();
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

/** A click event whose target is NOT the marching-ants overlay — the
 * shape every stage click resolves to unless the pointer happens to be
 * sitting exactly over that Konva node. */
const clickOnBackground = { target: { id: () => "" } };

describe("SelectTool marquee", () => {
  it("builds a rectangle marquee and excludes disabled tokens from its hit set", () => {
    const root = mount("rectangle");

    act(() => emitter.emit("dragStart", { tool: "select" }));
    // Mid-drag (not yet resolved), the marching-ants overlay DOES
    // render — only a finished, resolved selection hides it.
    expect(root.querySelector("[data-selection-overlay]")).not.toBeNull();
    pointer = { x: 50, y: 60 };
    act(() => emitter.emit("drag", { tool: "select" }));
    act(() => emitter.emit("dragEnd", { tool: "select" }));

    const selection = selectionFrom(root);
    expect(selection).toMatchObject({
      type: "rectangle",
      items: [{ id: "token-a", type: "token" }],
      data: { x: 0.1, y: 0.2 },
      // Bug fix (2026-10-26): a finished marquee selection is now
      // `resolved`, same as a shift+click selection — so it drops the
      // legacy marching-ants drag shape and switches to Token.tsx's
      // per-token group-drag path (types/Select.ts's doc comment).
      resolved: true,
    });
    expect(selection.data.width).toBeCloseTo(0.4);
    expect(selection.data.height).toBeCloseTo(0.4);
    expect(root.querySelector("output[data-selection]")).toHaveAttribute("data-menu-open", "true");
    // The marching-ants overlay (mocked `components/konva/Selection`)
    // must NOT render once the selection is resolved, or dragging a
    // token inside it would fight the overlay's own drag handling.
    expect(root.querySelector("[data-selection-overlay]")).toBeNull();
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

  it("regression (2026-10-26): survives the native stage click Konva fires right after the drag that resolved it", () => {
    // Bug report: "Tentei fazer uma seleção em massa... nenhum token foi
    // selecionado". Konva's "click tap" listener on the stage is
    // independent of this tool's own drag emitter and fires from the
    // SAME pointerup that ends the marquee drag. Before the fix, that
    // trailing click's target was never the (now unmounted) marching-ants
    // overlay, so it fell into the "clicked elsewhere" branch and wiped
    // the selection `end()` had just built, in the very same gesture.
    const root = mount("rectangle");

    act(() => emitter.emit("dragStart", { tool: "select" }));
    pointer = { x: 50, y: 60 };
    act(() => emitter.emit("drag", { tool: "select" }));
    act(() => emitter.emit("dragEnd", { tool: "select" }));

    expect(selectionFrom(root)).toMatchObject({ items: [{ id: "token-a" }], resolved: true });

    act(() => stage.emit("click tap", clickOnBackground));

    expect(selectionFrom(root)).toMatchObject({ items: [{ id: "token-a" }], resolved: true });
    expect(root.querySelector("output[data-selection]")).toHaveAttribute("data-menu-open", "true");

    // A SECOND, later click (a genuinely new one) must still clear it —
    // the suppression is only for that one trailing click, not forever.
    act(() => stage.emit("click tap", clickOnBackground));
    expect(selectionFrom(root)).toBeNull();
    expect(root.querySelector("output[data-selection]")).toHaveAttribute("data-menu-open", "false");
  });
});
