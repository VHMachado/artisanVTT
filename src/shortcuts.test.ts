import { describe, expect, it } from "vitest";

import shortcuts from "./shortcuts";

function keyEvent(key: string, init: KeyboardEventInit = {}) {
  return { key, ...init } as KeyboardEvent;
}

describe("map keyboard shortcuts", () => {
  it("matches tool keys without modifiers while accepting capitals", () => {
    expect(shortcuts.fogTool(keyEvent("f"))).toBe(true);
    expect(shortcuts.fogTool(keyEvent("F"))).toBe(true);
    expect(shortcuts.selectPath(keyEvent("l"))).toBe(true);
    expect(shortcuts.pointerTool(keyEvent("q"))).toBe(true);
    expect(shortcuts.measureTool(keyEvent("m"))).toBe(true);
    expect(shortcuts.fogTool(keyEvent("f", { ctrlKey: true }))).toBe(false);
    expect(shortcuts.selectPath(keyEvent("l", { shiftKey: true }))).toBe(false);
  });

  it("keeps command shortcuts distinct from tool shortcuts", () => {
    expect(shortcuts.undo(keyEvent("z", { ctrlKey: true }))).toBe(true);
    expect(shortcuts.undo(keyEvent("Z", { metaKey: true }))).toBe(true);
    expect(shortcuts.undo(keyEvent("z", { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(shortcuts.redo(keyEvent("y", { metaKey: true }))).toBe(true);
    expect(shortcuts.redo(keyEvent("Y", { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(shortcuts.copy(keyEvent("c", { ctrlKey: true }))).toBe(true);
    expect(shortcuts.paste(keyEvent("v", { metaKey: true }))).toBe(true);
    expect(shortcuts.stageZoomIn(keyEvent("+"))).toBe(true);
    expect(shortcuts.stageZoomIn(keyEvent("+", { ctrlKey: true }))).toBe(false);
  });

  it("preserves the intentional fog-key collision", () => {
    const fogKey = keyEvent("f");
    expect(shortcuts.fogTool(fogKey)).toBe(true);
    expect(shortcuts.fogPreview(fogKey)).toBe(true);
  });
});
