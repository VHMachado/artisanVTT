import { useEffect, useState } from "react";
import { Group } from "react-konva";

import { useGrid, useGridCellNormalizedSize, useGridCellPixelSize, useGridOffset } from "../../contexts/GridContext";
import { MapDragEvent, useInteractionEmitter } from "../../contexts/MapInteractionContext";
import { useMapStage } from "../../contexts/MapStageContext";
import { getDefaultShapeData, getUpdatedShapeData } from "../../helpers/geometry";
import { gridDistance, parseGridScale } from "../../helpers/grid";
import { getRelativePointerPosition } from "../../helpers/konva";
import { isToolBound, MouseButtonBindings, toolForAnyButtonEvent } from "../../helpers/mouseBindings";
import Vector2 from "../../helpers/Vector2";
import useGridSnapping from "../../hooks/useGridSnapping";
import { PointsData } from "../../types/Geometry";
import { Map } from "../../types/Map";
import Ruler from "../konva/Ruler";

type MapMeasureProps = { map: Map | null; bindings: MouseButtonBindings };
type MeasureData = { length: number; points: Vector2[] };

type MeasureDependencies = {
  grid: ReturnType<typeof useGrid>;
  cellNormalizedSize: ReturnType<typeof useGridCellNormalizedSize>;
  cellPixels: ReturnType<typeof useGridCellPixelSize>;
  offset: ReturnType<typeof useGridOffset>;
};

function makeMeasureData(anchor: Vector2): MeasureData {
  const { points } = getDefaultShapeData("line", anchor) as PointsData;
  return { length: 0, points };
}

function extendMeasure(data: MeasureData, pointer: Vector2, image: any, dependencies: MeasureDependencies): MeasureData {
  const { points } = getUpdatedShapeData("line", data, pointer, dependencies.cellNormalizedSize, 1, 1) as PointsData;
  const imageSize = { x: image.width(), y: image.height() };
  const [start, end] = points.map((point) => Vector2.subtract(Vector2.multiply(point, imageSize), dependencies.offset));
  return { points, length: gridDistance(dependencies.grid, start, end, dependencies.cellPixels) };
}

function MeasurementRuler({ data, scale }: { data: MeasureData | null; scale: ReturnType<typeof parseGridScale> }) {
  return data ? <Ruler points={data.points} scale={scale} length={data.length} /> : null;
}

function MeasureTool({ map, bindings }: MapMeasureProps) {
  const enabled = isToolBound("measure", bindings);
  const emitter = useInteractionEmitter();
  const stageRef = useMapStage();
  const grid = useGrid();
  const cellNormalizedSize = useGridCellNormalizedSize();
  const cellPixels = useGridCellPixelSize();
  const offset = useGridOffset();
  const [data, setData] = useState<MeasureData | null>(null);
  const [dragging, setDragging] = useState(false);
  const scale = parseGridScale(enabled ? grid.measurement.scale : null);
  const snap = useGridSnapping(grid.measurement.type === "euclidean" ? 0 : 1, false);
  const dependencies = { grid, cellNormalizedSize, cellPixels, offset };

  useEffect(() => {
    if (!enabled) return;
    const image = stageRef.current?.findOne("#mapImage");
    const positionAtPointer = () => {
      const raw = image && getRelativePointerPosition(image);
      if (!raw || !image) return undefined;
      const positioned = map?.snapToGrid ? snap(raw) : raw;
      return Vector2.divide(positioned, { x: image.width(), y: image.height() });
    };
    const isMeasureGesture = (event: MapDragEvent) => toolForAnyButtonEvent(event, bindings) === "measure";
    const start = (event: MapDragEvent) => {
      if (!isMeasureGesture(event)) return;
      const anchor = positionAtPointer();
      if (!anchor) return;
      setData(makeMeasureData(anchor));
      setDragging(true);
    };
    const move = (event: MapDragEvent) => {
      if (!isMeasureGesture(event) || !dragging || !data || !image) return;
      const pointer = positionAtPointer();
      if (pointer) setData(extendMeasure(data, pointer, image, dependencies));
    };
    const end = (event: MapDragEvent) => {
      if (!isMeasureGesture(event)) return;
      setData(null);
      setDragging(false);
    };

    emitter?.on("dragStart", start);
    emitter?.on("drag", move);
    emitter?.on("dragEnd", end);
    return () => {
      emitter?.off("dragStart", start);
      emitter?.off("drag", move);
      emitter?.off("dragEnd", end);
    };
  });

  return <Group><MeasurementRuler data={data} scale={scale} /></Group>;
}

export default MeasureTool;
