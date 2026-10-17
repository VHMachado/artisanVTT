import { useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Group } from "react-konva";

import { useGridCellNormalizedSize } from "../../contexts/GridContext";
import { MapDragEvent, useDebouncedStageScale, useInteractionEmitter, useMapHeight, useMapWidth } from "../../contexts/MapInteractionContext";
import { useMapStage } from "../../contexts/MapStageContext";
import { getDefaultShapeData, getUpdatedShapeData, simplifyPoints } from "../../helpers/geometry";
import { getRelativePointerPosition, scaleAndFlattenPoints } from "../../helpers/konva";
import { isToolBound, MouseButtonBindings, toolForAnyButtonEvent } from "../../helpers/mouseBindings";
import { getSelectionPoints } from "../../helpers/selection";
import { Intersection } from "../../helpers/token";
import Vector2 from "../../helpers/Vector2";
import { RectData } from "../../types/Geometry";
import { SelectionItemsChangeEventHandler } from "../../types/Events";
import { Map } from "../../types/Map";
import { Selection as SelectionType, SelectionItem, SelectToolSettings } from "../../types/Select";
import Selection from "../konva/Selection";

type MapSelectProps = {
  bindings: MouseButtonBindings;
  toolSettings: SelectToolSettings;
  onSelectionItemsChange: SelectionItemsChangeEventHandler;
  selection: SelectionType | null;
  onSelectionChange: React.Dispatch<React.SetStateAction<SelectionType | null>>;
  onSelectionMenuOpen: (open: boolean) => void;
  onSelectionDragStart: () => void;
  onSelectionDragEnd: () => void;
  disabledTokens: Record<string, boolean>;
  map: Map;
};

type SelectionCanvas = { width: number; height: number; cellSize: Vector2; scale: number };

function newSelection(type: SelectToolSettings["type"], point: Vector2): SelectionType {
  if (type === "path") return { type, items: [], data: { points: [point] }, x: 0, y: 0 };
  return { type, items: [], data: getDefaultShapeData("rectangle", point) as RectData, x: 0, y: 0 };
}

function extendSelection(selection: SelectionType, point: Vector2, canvas: SelectionCanvas): SelectionType {
  if (selection.type === "rectangle") {
    return { ...selection, data: getUpdatedShapeData("rectangle", selection.data, point, canvas.cellSize, canvas.width, canvas.height) as RectData };
  }
  const previous = selection.data.points;
  if (Vector2.compare(previous[previous.length - 1], point, 0.001)) return selection;
  return { ...selection, data: { points: simplifyPoints([...previous, point], 1 / 1000 / canvas.scale) } };
}

function hitTokens(stage: Konva.Stage, selection: SelectionType, canvas: Pick<SelectionCanvas, "width" | "height">, disabled: Record<string, boolean>): SelectionItem[] {
  const intersection = new Intersection(
    { type: "path", points: scaleAndFlattenPoints(getSelectionPoints(selection), { x: canvas.width, y: canvas.height }) },
    { x: selection.x, y: selection.y }, { x: 0, y: 0 }, 0
  );
  return stage.find<Konva.Group>("#tokens").flatMap((group) => (group.children || []).flatMap((token) => {
    const id = token.id();
    return id && !disabled[id] && intersection.intersects(token.position()) ? [{ type: "token" as const, id }] : [];
  }));
}

function SelectionOverlay({ selection, props, prevent }: { selection: SelectionType | null; props: MapSelectProps; prevent: React.MutableRefObject<boolean> }) {
  if (!selection || selection.builtByClick) return null;
  return <Selection selection={selection} onSelectionChange={props.onSelectionChange} onSelectionItemsChange={props.onSelectionItemsChange} onPreventSelectionChange={(value) => { prevent.current = value; }} onSelectionDragStart={props.onSelectionDragStart} onSelectionDragEnd={props.onSelectionDragEnd} map={props.map} />;
}

function SelectTool(props: MapSelectProps) {
  const enabled = isToolBound("select", props.bindings);
  const listensForClicks = enabled || props.bindings.left === "move" || props.bindings.left === "select";
  const stageScale = useDebouncedStageScale();
  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const cellSize = useGridCellNormalizedSize();
  const emitter = useInteractionEmitter();
  const stageRef = useMapStage();
  const [brushing, setBrushing] = useState(false);
  const preventSelection = useRef(false);

  useEffect(() => {
    if (!listensForClicks) return;
    const stage = stageRef.current;
    const image = stage?.findOne("#mapImage");
    const pointerPosition = () => {
      const position = image && getRelativePointerPosition(image);
      return position && image ? Vector2.divide(position, { x: image.width(), y: image.height() }) : undefined;
    };
    const selectGesture = (event: MapDragEvent) => toolForAnyButtonEvent(event, props.bindings) === "select";
    const start = (event: MapDragEvent) => {
      if (!selectGesture(event) || preventSelection.current) return;
      const point = pointerPosition();
      if (!point) return;
      props.onSelectionChange(newSelection(props.toolSettings.type, point));
      setBrushing(true);
    };
    const move = (event: MapDragEvent) => {
      if (!selectGesture(event) || preventSelection.current || !brushing || !props.selection || !image) return;
      const point = pointerPosition();
      if (!point) return;
      const canvas = { width: mapWidth, height: mapHeight, cellSize, scale: stageScale };
      props.onSelectionChange((current) => current ? extendSelection(current, point, canvas) : current);
    };
    const end = (event: MapDragEvent) => {
      if (!selectGesture(event) || preventSelection.current) return;
      setBrushing(false);
      if (!props.selection || !stage) {
        props.onSelectionChange(null);
        return;
      }
      const items = hitTokens(stage, props.selection, { width: mapWidth, height: mapHeight }, props.disabledTokens);
      if (!items.length) {
        props.onSelectionChange(null);
        return;
      }
      props.onSelectionChange((current) => current ? { ...current, items } : current);
      props.onSelectionMenuOpen(true);
    };
    const click = (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (event.target.id() === "selection") props.onSelectionMenuOpen(true);
      else {
        props.onSelectionChange(null);
        props.onSelectionMenuOpen(false);
      }
    };

    emitter?.on("dragStart", start);
    emitter?.on("drag", move);
    emitter?.on("dragEnd", end);
    stage?.on("click tap", click);
    return () => {
      emitter?.off("dragStart", start);
      emitter?.off("drag", move);
      emitter?.off("dragEnd", end);
      stage?.off("click tap", click);
    };
  });

  return <Group><SelectionOverlay selection={props.selection} props={props} prevent={preventSelection} /></Group>;
}

export default SelectTool;
