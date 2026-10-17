import { useRef } from "react";
import { Group, Circle, Rect } from "react-konva";
import Konva from "konva";

import {
  useDebouncedStageScale,
  useMapWidth,
  useMapHeight,
  useSetPreventMapInteraction,
} from "../../contexts/MapInteractionContext";
import { useKeyboard } from "../../contexts/KeyboardContext";

import Vector2 from "../../helpers/Vector2";

import shortcuts from "../../shortcuts";
import { Map } from "../../types/Map";
import { GridInset } from "../../types/Grid";

type HandleName = "topLeft" | "topRight" | "bottomRight" | "bottomLeft" | "center";

type MapGridEditorProps = {
  map: Map;
  onGridChange: (inset: GridInset) => void;
};

/**
 * Five draggable handles (one per corner plus a center one) that let the
 * user reshape a map's grid inset by eye. Corner handles scale the inset
 * from the opposite corner while preserving aspect ratio; the center
 * handle translates it.
 */
function MapGridEditor({ map, onGridChange }: MapGridEditorProps) {
  const stageScale = useDebouncedStageScale();
  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const setPreventMapInteraction = useSetPreventMapInteraction();

  const mapSize = { x: mapWidth, y: mapHeight };

  function getHandlePositions() {
    const topLeft = Vector2.multiply(map.grid.inset.topLeft, mapSize);
    const bottomRight = Vector2.multiply(map.grid.inset.bottomRight, mapSize);

    return {
      topLeft,
      topRight: { x: bottomRight.x, y: topLeft.y },
      bottomRight,
      bottomLeft: { x: topLeft.x, y: bottomRight.y },
      size: Vector2.subtract(bottomRight, topLeft),
      offset: Vector2.multiply(topLeft, -1),
    };
  }
  const handlePositions = getHandlePositions();

  function getHandleNormalizedPosition(handle: Konva.Node): Vector2 {
    return Vector2.divide({ x: handle.x(), y: handle.y() }, mapSize);
  }

  const previousHandlePositionRef = useRef<Vector2>();

  function handleScaleCircleDragStart(event: Konva.KonvaEventObject<MouseEvent>) {
    previousHandlePositionRef.current = getHandleNormalizedPosition(event.target);
  }

  function handleScaleCircleDragMove(event: Konva.KonvaEventObject<MouseEvent>) {
    onGridChange(getHandleInset(event.target));
    previousHandlePositionRef.current = getHandleNormalizedPosition(event.target);
  }

  function handleScaleCircleDragEnd(event: Konva.KonvaEventObject<MouseEvent>) {
    onGridChange(getHandleInset(event.target));
    setPreventMapInteraction(false);
  }

  function handleInteractivePointerDown() {
    setPreventMapInteraction(true);
  }
  function handleInteractivePointerUp() {
    setPreventMapInteraction(false);
  }

  /**
   * Scales the inset from the corner opposite `handle`, keeping aspect
   * ratio: the drag delta is projected onto the diagonal that the handle
   * moves along (via its dot product with that diagonal's direction) so
   * dragging straight at the opposite corner moves the handle exactly that
   * far, while an off-axis drag moves it by its component along the
   * diagonal only.
   */
  function getHandleInset(handle: Konva.Node): GridInset {
    const name = handle.name() as HandleName;

    const previousPosition = previousHandlePositionRef.current;
    if (!previousPosition) {
      return map.grid.inset;
    }
    const position = getHandleNormalizedPosition(handle);
    const dragDistance = Vector2.distance(previousPosition, position);
    const dragDirection = Vector2.normalize(
      Vector2.subtract(position, previousPosition)
    );

    const inset: GridInset = {
      topLeft: { ...map.grid.inset.topLeft },
      bottomRight: { ...map.grid.inset.bottomRight },
    };

    if (dragDirection.x === 0 && dragDirection.y === 0) {
      return inset;
    }

    function moveAlongDiagonal(from: Vector2, to: Vector2): Vector2 {
      const diagonalDirection = Vector2.normalize(Vector2.subtract(from, to));
      const alignment = Vector2.dot(dragDirection, diagonalDirection);
      const offset = Vector2.multiply(diagonalDirection, dragDistance * alignment);
      return Vector2.add(previousPosition as Vector2, offset);
    }

    switch (name) {
      case "topLeft": {
        const newPosition = moveAlongDiagonal(inset.topLeft, inset.bottomRight);
        return { topLeft: newPosition, bottomRight: inset.bottomRight };
      }
      case "topRight": {
        const topRight = { x: inset.bottomRight.x, y: inset.topLeft.y };
        const bottomLeft = { x: inset.topLeft.x, y: inset.bottomRight.y };
        const newPosition = moveAlongDiagonal(topRight, bottomLeft);
        return {
          topLeft: { x: inset.topLeft.x, y: newPosition.y },
          bottomRight: { x: newPosition.x, y: inset.bottomRight.y },
        };
      }
      case "bottomRight": {
        const newPosition = moveAlongDiagonal(inset.bottomRight, inset.topLeft);
        return { topLeft: inset.topLeft, bottomRight: newPosition };
      }
      case "bottomLeft": {
        const bottomLeft = { x: inset.topLeft.x, y: inset.bottomRight.y };
        const topRight = { x: inset.bottomRight.x, y: inset.topLeft.y };
        const newPosition = moveAlongDiagonal(bottomLeft, topRight);
        return {
          topLeft: { x: newPosition.x, y: inset.topLeft.y },
          bottomRight: { x: inset.bottomRight.x, y: newPosition.y },
        };
      }
      case "center": {
        const offset = Vector2.subtract(position, previousPosition);
        return {
          topLeft: Vector2.add(inset.topLeft, offset),
          bottomRight: Vector2.add(inset.bottomRight, offset),
        };
      }
      default:
        return inset;
    }
  }

  function nudgeGrid(direction: Vector2, scale: number) {
    const inset = map.grid.inset;
    const cellSizeNormalized = Vector2.divide(
      Vector2.subtract(inset.bottomRight, inset.topLeft),
      map.grid.size
    );
    const offset = Vector2.multiply(
      Vector2.multiply(direction, cellSizeNormalized),
      Math.min(scale / (stageScale * stageScale), 1)
    );
    onGridChange({
      topLeft: Vector2.add(inset.topLeft, offset),
      bottomRight: Vector2.add(inset.bottomRight, offset),
    });
  }

  function handleKeyDown(event: KeyboardEvent) {
    const nudgeAmount = event.shiftKey ? 2 : 0.5;
    if (shortcuts.gridNudgeUp(event)) {
      event.preventDefault();
      nudgeGrid({ x: 0, y: -1 }, nudgeAmount);
    }
    if (shortcuts.gridNudgeLeft(event)) {
      nudgeGrid({ x: -1, y: 0 }, nudgeAmount);
    }
    if (shortcuts.gridNudgeRight(event)) {
      nudgeGrid({ x: 1, y: 0 }, nudgeAmount);
    }
    if (shortcuts.gridNudgeDown(event)) {
      event.preventDefault();
      nudgeGrid({ x: 0, y: 1 }, nudgeAmount);
    }
  }
  useKeyboard(handleKeyDown);

  const editCircleRadius = Math.max(
    (Math.min(mapWidth, mapHeight) / 30) * Math.max(1 / stageScale, 1),
    1
  );

  const editCircleProps = {
    radius: editCircleRadius,
    fill: "rgba(0, 0, 0, 0.5)",
    stroke: "white",
    strokeWidth: editCircleRadius / 5,
    draggable: true,
    onDragStart: handleScaleCircleDragStart,
    onDragMove: handleScaleCircleDragMove,
    onDragEnd: handleScaleCircleDragEnd,
    onMouseDown: handleInteractivePointerDown,
    onMouseUp: handleInteractivePointerUp,
    onTouchStart: handleInteractivePointerDown,
    onTouchEnd: handleInteractivePointerUp,
  };

  const editRectProps = {
    fill: "transparent",
    stroke: "rgba(255, 255, 255, 0.75)",
    strokeWidth: editCircleRadius / 10,
  };

  return (
    <Group>
      <Rect
        width={handlePositions.size.x}
        height={handlePositions.size.y}
        offset={handlePositions.offset}
        {...editRectProps}
      />
      <Circle x={handlePositions.topLeft.x} y={handlePositions.topLeft.y} name="topLeft" {...editCircleProps} />
      <Circle x={handlePositions.topRight.x} y={handlePositions.topRight.y} name="topRight" {...editCircleProps} />
      <Circle x={handlePositions.bottomRight.x} y={handlePositions.bottomRight.y} name="bottomRight" {...editCircleProps} />
      <Circle x={handlePositions.bottomLeft.x} y={handlePositions.bottomLeft.y} name="bottomLeft" {...editCircleProps} />
      <Circle
        x={(handlePositions.topLeft.x + handlePositions.bottomRight.x) / 2}
        y={(handlePositions.topLeft.y + handlePositions.bottomRight.y) / 2}
        name="center"
        {...editCircleProps}
        radius={editCircleRadius / 1.5}
      />
    </Group>
  );
}

export default MapGridEditor;
