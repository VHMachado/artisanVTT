export type Shortcut = (event: KeyboardEvent) => boolean;

function hasToolModifier(event: KeyboardEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function plainKey(key: string): Shortcut {
  const uppercaseKey = key.toUpperCase();
  return (event) =>
    !hasToolModifier(event) &&
    (event.key === key || event.key === uppercaseKey);
}

function commandKey(key: string): Shortcut {
  const uppercaseKey = key.toUpperCase();
  return (event) =>
    (event.key === key || event.key === uppercaseKey) &&
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey;
}

function zoomKey(...keys: string[]): Shortcut {
  return (event) => keys.includes(event.key) && !event.ctrlKey && !event.metaKey;
}

const shortcuts: Record<string, Shortcut> = {
  move: plainKey(" "),
  moveTool: plainKey("w"),
  fogTool: plainKey("f"),
  measureTool: plainKey("m"),
  pointerTool: plainKey("q"),
  darknessToggle: plainKey("k"),

  gridNudgeUp: ({ key }) => key === "ArrowUp",
  gridNudgeLeft: ({ key }) => key === "ArrowLeft",
  gridNudgeRight: ({ key }) => key === "ArrowRight",
  gridNudgeDown: ({ key }) => key === "ArrowDown",

  fogPolygon: plainKey("p"),
  fogRectangle: plainKey("r"),
  fogBrush: plainKey("b"),
  fogToggle: plainKey("t"),
  fogErase: plainKey("e"),
  fogLayer: plainKey("l"),
  fogPreview: plainKey("f"),
  fogCut: plainKey("c"),
  fogFinishPolygon: ({ key }) => key === "Enter",
  fogCancelPolygon: ({ key }) => key === "Escape",

  selectTool: plainKey("s"),
  selectPath: plainKey("l"),
  selectRect: plainKey("r"),

  stageZoomIn: zoomKey("=", "+"),
  stageZoomOut: zoomKey("-", "_"),
  stagePrecisionZoom: ({ key }) => key === "Shift",

  selectRange: ({ key }) => key === "Shift",
  selectMultiple: ({ key }) => key === "Control" || key === "Meta",

  undo: commandKey("z"),
  redo: (event) =>
    (event.key === "y" || event.key === "Y") &&
    (event.ctrlKey || event.metaKey),
  copy: commandKey("c"),
  paste: commandKey("v"),
  delete: ({ key }) => key === "Backspace" || key === "Delete",
  disableSnapping: ({ key }) => key === "Control" || key === "Meta",
  duplicate: ({ key }) => key === "Alt",
};

export default shortcuts;
