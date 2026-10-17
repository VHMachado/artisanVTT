import Konva from "konva";
import { useEffect, useRef } from "react";
import { Rect, Line } from "react-konva";

import { useGridStrokeWidth } from "../../contexts/GridContext";
import { useMapHeight, useMapWidth, useStageScale } from "../../contexts/MapInteractionContext";
import { useUserId } from "../../contexts/UserIdContext";
import colors from "../../helpers/colors";
import { scaleAndFlattenPoints } from "../../helpers/konva";
import Vector2 from "../../helpers/Vector2";
import useGridSnapping from "../../hooks/useGridSnapping";
import { SelectionItemsChangeEventHandler } from "../../types/Events";
import { Map } from "../../types/Map";
import { Selection as SelectionType, SelectionItemType } from "../../types/Select";
import { TokenState } from "../../types/TokenState";

// How fast the marching-ants dash pattern crawls, in dash-units per ms.
const DASH_ANIMATION_SPEED = -0.01;

interface SelectionProps extends Konva.ShapeConfig {
  selection: SelectionType;
  map: Map;
  onSelectionChange: (selection: SelectionType | null) => void;
  onSelectionItemsChange: SelectionItemsChangeEventHandler;
  onPreventSelectionChange: (preventSelection: boolean) => void;
  onSelectionDragStart: () => void;
  onSelectionDragEnd: () => void;
}

interface IntersectingNode {
  id: string;
  type: SelectionItemType;
  node: Konva.Node;
  initialX: number;
  initialY: number;
}

function findDraggableSelectionNodes(stage: Konva.Stage, selection: SelectionType): IntersectingNode[] {
  const nodes: IntersectingNode[] = [];
  for (const item of selection.items) {
    const node = stage.findOne(`#${item.id}`);
    // Locked tokens stay put even while the rest of the selection moves.
    const isLocked = node?.name().endsWith("-locked");
    if (node && !isLocked) {
      nodes.push({ ...item, node, initialX: node.x(), initialY: node.y() });
    }
  }
  return nodes;
}

function setStageCursor(stage: Konva.Stage | null, cursor: string) {
  if (stage) {
    stage.content.style.cursor = cursor;
  }
}

/** The marquee a `SelectTool` drag leaves behind: a dashed outline
 * (lasso path or rectangle) that, once it has items, can itself be
 * dragged to move every selected token together. */
function Selection(props: SelectionProps) {
  const {
    selection,
    onSelectionChange,
    onSelectionItemsChange,
    onPreventSelectionChange,
    onSelectionDragStart,
    onSelectionDragEnd,
    map,
    ...shapeProps
  } = props;

  const userId = useUserId();

  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const stageScale = useStageScale();
  const gridStrokeWidth = useGridStrokeWidth();
  const snapPositionToGrid = useGridSnapping();

  const hasItems = selection.items.length > 0;

  const draggedNodesRef = useRef<IntersectingNode[]>([]);
  const dragStartPositionRef = useRef({ x: 0, y: 0 });

  function handleDragStart(event: Konva.KonvaEventObject<DragEvent>) {
    dragStartPositionRef.current = event.target.position();
    const stage = event.target.getStage();
    draggedNodesRef.current = stage ? findDraggableSelectionNodes(stage, selection) : [];
    onSelectionDragStart();
  }

  function handleDragMove(event: Konva.KonvaEventObject<DragEvent>) {
    const delta = Vector2.subtract(event.target.position(), dragStartPositionRef.current);
    draggedNodesRef.current.forEach((item) => {
      const basePosition = { x: item.initialX, y: item.initialY };
      const nextPosition = Vector2.add(basePosition, delta);
      item.node.position(map.snapToGrid ? snapPositionToGrid(nextPosition) : nextPosition);
    });
  }

  function handleDragEnd(event: Konva.KonvaEventObject<DragEvent>) {
    const tokenChanges: Record<string, Partial<TokenState>> = {};
    draggedNodesRef.current.forEach((item) => {
      tokenChanges[item.id] = {
        x: item.node.x() / mapWidth,
        y: item.node.y() / mapHeight,
        lastModifiedBy: userId,
        lastModified: Date.now(),
      };
    });

    onSelectionItemsChange(tokenChanges);
    onSelectionChange({ ...selection, x: event.target.x() / mapWidth, y: event.target.y() / mapHeight });

    draggedNodesRef.current = [];
    onPreventSelectionChange(false);
    onSelectionDragEnd();
  }

  const handlePointerDown = () => onPreventSelectionChange(true);
  const handlePointerUp = () => onPreventSelectionChange(false);

  function setMoveCursor(event: Konva.KonvaEventObject<MouseEvent>) {
    const stage = event.target.getStage();
    if (hasItems) setStageCursor(stage, "move");
  }

  function clearCursor(event: Konva.KonvaEventObject<MouseEvent>) {
    setStageCursor(event.target.getStage(), "");
  }

  const lineRef = useRef<Konva.Line>(null);
  const rectRef = useRef<Konva.Rect>(null);

  // Keep the cursor in "move" state for as long as the selection holds
  // items, even without the mouse re-entering the shape (e.g. right
  // after a drag just picked up a new set of tokens).
  useEffect(() => {
    const shapeNode = lineRef.current ?? rectRef.current;
    const stage = shapeNode?.getStage() ?? null;
    if (hasItems) setStageCursor(stage, "move");
    return () => setStageCursor(stage, "");
  }, [hasItems]);

  // Marching-ants dash animation, running only while there's something
  // selected to show it on.
  useEffect(() => {
    if (!hasItems) return undefined;

    let previousTime = performance.now();
    let frameId: number;

    function tick(time: number) {
      const elapsed = time - previousTime;
      previousTime = time;
      const activeNode = lineRef.current ?? rectRef.current;
      activeNode?.dashOffset(activeNode.dashOffset() + elapsed * DASH_ANIMATION_SPEED);
      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [hasItems]);

  const strokeWidth = (gridStrokeWidth * 0.75) / stageScale;

  const sharedProps = {
    id: "selection",
    stroke: colors.primary,
    strokeWidth,
    dash: hasItems ? [strokeWidth / 2, strokeWidth * 2] : [],
    draggable: true,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onDragEnd: handleDragEnd,
    onMouseDown: handlePointerDown,
    onMouseUp: handlePointerUp,
    onTouchStart: handlePointerDown,
    onTouchEnd: handlePointerUp,
    onMouseEnter: setMoveCursor,
    onMouseOut: clearCursor,
    // A wide invisible hit area while still drawing the marquee keeps
    // the deselection click (which fires on anything NOT hitting this
    // shape) from triggering on a hairline-thin selection outline.
    hitStrokeWidth: hasItems ? undefined : 100,
  };

  const x = selection.x * mapWidth;
  const y = selection.y * mapHeight;

  if (selection.type === "path") {
    const flattenedPoints = scaleAndFlattenPoints(selection.data.points, { x: mapWidth, y: mapHeight });
    return (
      <Line
        ref={lineRef}
        x={x}
        y={y}
        points={flattenedPoints}
        tension={0.5}
        closed={hasItems}
        lineCap="round"
        lineJoin="round"
        {...sharedProps}
        {...shapeProps}
      />
    );
  }

  return (
    <Rect
      ref={rectRef}
      x={x}
      y={y}
      offsetX={-selection.data.x * mapWidth}
      offsetY={-selection.data.y * mapHeight}
      width={selection.data.width * mapWidth}
      height={selection.data.height * mapHeight}
      lineCap="round"
      lineJoin="round"
      {...sharedProps}
      {...shapeProps}
    />
  );
}

export default Selection;
