import { useCallback, useEffect, useMemo, useState } from "react";
import Color from "color";
import FogShape from "../konva/Fog";
import Konva from "konva";
import Tick from "../konva/Tick";
import shortid from "shortid";
import { Group, Line } from "react-konva";
import useImage from "use-image";

import CutFogAction from "../../actions/CutFogAction";
import SubtractFogAction from "../../actions/SubtractFogAction";
import { useGrid, useGridCellNormalizedSize, useGridCellPixelOffset, useGridCellPixelSize, useGridOffset, useGridSnappingSensitivity, useGridStrokeWidth } from "../../contexts/GridContext";
import { useKeyboard } from "../../contexts/KeyboardContext";
import { MapDragEvent, useDebouncedStageScale, useInteractionEmitter, useMapHeight, useMapWidth } from "../../contexts/MapInteractionContext";
import { useMapStage } from "../../contexts/MapStageContext";
import colors from "../../helpers/colors";
import { simplifyPoints } from "../../helpers/geometry";
import { findBestGuides, getFogShapesBoundingBoxes, getGuidesFromBoundingBoxes, getGuidesFromGridCell, Guide, mergeFogShapes } from "../../helpers/fog";
import { getRelativePointerPosition } from "../../helpers/konva";
import { isToolBound, MouseButtonBindings, toolForAnyButtonEvent } from "../../helpers/mouseBindings";
import { keyBy } from "../../helpers/shared";
import Vector2, { BoundingBox } from "../../helpers/Vector2";
import useSetting from "../../hooks/useSetting";
import diagonalPattern from "../../images/DiagonalPattern.png";
import shortcuts from "../../shortcuts";
import { Map } from "../../types/Map";
import { Fog, FogToolSettings } from "../../types/Fog";

type MapFogProps = Readonly<{
  bindings: MouseButtonBindings;
  editable: boolean;
  map: Map | null;
  shapes: Fog[];
  toolSettings: FogToolSettings;
  onShapeError: (message: string) => void;
  onShapesAdd: (fogs: Fog[]) => void;
  onShapesCut: (fogs: Fog[]) => void;
  onShapesEdit: (changes: Partial<Fog>[]) => void;
  onShapesRemove: (ids: string[]) => void;
}>;

type FogToolCallbacks = Pick<MapFogProps, "onShapesAdd" | "onShapesCut" | "onShapeError">;
type GuideContext = { width: number; height: number; guides: Guide[] };

const DEFAULT_STROKE_WIDTH = 0.5;

function draftFog(points: Vector2[], cut: boolean): Fog {
  return { id: shortid.generate(), type: "fog", data: { points, holes: [] }, strokeWidth: DEFAULT_STROKE_WIDTH, color: cut ? "red" : "black", visible: true };
}

function rectangularPoints(start: Vector2, end: Vector2): Vector2[] {
  return [start, { x: end.x, y: start.y }, end, { x: start.x, y: end.y }];
}

function trimToLayer(drawn: Fog[], existing: Fog[], settings: FogToolSettings) {
  if (settings.multilayer) return drawn;
  const blockers = existing.filter((shape) => settings.useFogCut ? !shape.visible : shape.visible);
  const result = new SubtractFogAction(blockers).execute(keyBy(drawn, "id"));
  return Object.values(result).filter((shape) => shape.data.points.length > 2).map((shape) => ({ ...shape, id: shortid.generate() }));
}

function publishFog(drawn: Fog[], existing: Fog[], settings: FogToolSettings, callbacks: FogToolCallbacks) {
  const prepared = trimToLayer(drawn, existing, settings);
  if (!prepared.length) return callbacks.onShapeError(settings.useFogCut ? "Fog already cut" : "Fog already placed");
  if (!settings.useFogCut) return callbacks.onShapesAdd(prepared.map((shape) => ({ ...shape, color: "black" })));
  const cut = new CutFogAction(prepared).execute(keyBy(existing, "id"));
  if (Object.keys(cut).length === existing.length) callbacks.onShapeError("No fog to cut");
  else callbacks.onShapesCut(prepared);
}

function guidePosition(point: Vector2, context: GuideContext) {
  const snapped = { ...point };
  for (const guide of context.guides) {
    if (guide.orientation === "vertical") snapped.x = guide.start.x * context.width;
    if (guide.orientation === "horizontal") snapped.y = guide.start.y * context.height;
  }
  return snapped;
}

function FogTool(props: MapFogProps) {
  const { map, shapes, bindings, toolSettings, editable } = props;
  const active = isToolBound("fog", bindings);
  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const stageScale = useDebouncedStageScale();
  const stageRef = useMapStage();
  const emitter = useInteractionEmitter();
  const grid = useGrid();
  const normalizedCell = useGridCellNormalizedSize();
  const pixelCell = useGridCellPixelSize();
  const pixelOffset = useGridCellPixelOffset();
  const gridOffset = useGridOffset();
  const gridStrokeWidth = useGridStrokeWidth();
  const snapSensitivity = Math.max(useGridSnappingSensitivity(), 0);
  const [showGuides] = useSetting<boolean>("fog.showGuides");
  const [editOpacity] = useSetting<number>("fog.editOpacity");
  const [patternImage] = useImage(diagonalPattern);
  const [draft, setDraft] = useState<Fog | null>(null);
  const [brushing, setBrushing] = useState(false);
  const [hovered, setHovered] = useState<Fog[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);

  const hoverMode = active && editable && (toolSettings.type === "toggle" || toolSettings.type === "remove");
  const guideMode = active && editable && (toolSettings.type === "rectangle" || toolSettings.type === "polygon");
  const showGuideLines = guideMode && showGuides;
  const guideBounds = useMemo<BoundingBox[]>(() => showGuideLines ? getFogShapesBoundingBoxes(shapes.filter((shape) => (active && !toolSettings.preview) || shape.visible), 5) : [], [active, shapes, showGuideLines, toolSettings.preview]);
  const visibleFogs = useMemo(() => editable ? shapes.filter((shape) => (active && !toolSettings.preview) || shape.visible) : mergeFogShapes(shapes), [active, editable, shapes, toolSettings.preview]);
  const finalize = useCallback((shape: Fog) => publishFog([shape], shapes, toolSettings, props), [props, shapes, toolSettings]);

  const pointer = useCallback((snap: boolean) => {
    const image = stageRef.current?.findOne("#mapImage");
    const position = image && getRelativePointerPosition(image);
    if (!image || !position) return undefined;
    const placed = snap && guideMode ? guidePosition(position, { width: mapWidth, height: mapHeight, guides }) : position;
    return Vector2.divide(placed, { x: image.width(), y: image.height() });
  }, [guideMode, guides, mapHeight, mapWidth, stageRef]);

  const flushHovered = useCallback((event: MapDragEvent | Konva.KonvaEventObject<MouseEvent>) => {
    if (toolForAnyButtonEvent(event, bindings) !== "fog" || !hovered.length) return;
    if (toolSettings.type === "remove") props.onShapesRemove(hovered.map((shape) => shape.id));
    if (toolSettings.type === "toggle") props.onShapesEdit(hovered.map((shape) => ({ id: shape.id, visible: !shape.visible })));
    setHovered([]);
  }, [bindings, hovered, props, toolSettings.type]);

  const updateGuides = useCallback(() => {
    if (!guideMode) return;
    const location = pointer(false);
    if (!location) return;
    const absolute = Vector2.multiply(location, { x: mapWidth, y: mapHeight });
    const candidates = [
      ...getGuidesFromBoundingBoxes(location, guideBounds, normalizedCell, snapSensitivity),
      ...(map?.snapToGrid ? getGuidesFromGridCell(absolute, grid, pixelCell, gridOffset, pixelOffset, snapSensitivity, { x: mapWidth, y: mapHeight }) : []),
    ];
    setGuides(findBestGuides(location, candidates));
  }, [grid, gridOffset, guideBounds, guideMode, map?.snapToGrid, mapHeight, mapWidth, normalizedCell, pixelCell, pixelOffset, pointer, snapSensitivity]);

  useEffect(() => {
    if (!active || !editable) return;
    const stage = stageRef.current;
    const bound = (event: MapDragEvent) => toolForAnyButtonEvent(event, bindings) === "fog";
    const begin = (event: MapDragEvent) => {
      if (!bound(event)) return;
      const at = pointer(true);
      if (!at) return;
      if (toolSettings.type === "brush") setDraft(draftFog([at], toolSettings.useFogCut));
      if (toolSettings.type === "rectangle") setDraft(draftFog([at, at, at, at], toolSettings.useFogCut));
      setBrushing(true);
    };
    const draw = (event: MapDragEvent) => {
      if (!bound(event) || !brushing || !draft) return;
      const at = pointer(true);
      if (!at) return;
      if (toolSettings.type === "brush") setDraft((current) => current && !Vector2.compare(current.data.points[current.data.points.length - 1], at, 0.001) ? { ...current, data: { ...current.data, points: [...current.data.points, at] } } : current);
      if (toolSettings.type === "rectangle") setDraft((current) => current ? { ...current, data: { ...current.data, points: rectangularPoints(current.data.points[0], at) } } : current);
    };
    const complete = (event: MapDragEvent) => {
      if (!bound(event)) return;
      if ((toolSettings.type === "brush" || toolSettings.type === "rectangle") && draft) {
        const shape = toolSettings.type === "brush" ? { ...draft, data: { ...draft.data, points: simplifyPoints(draft.data.points, 1 / 1000 / stageScale) } } : draft;
        finalize(shape);
        setDraft(null);
      }
      flushHovered(event);
      setBrushing(false);
    };
    const click = (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (toolForAnyButtonEvent(event, bindings) !== "fog" || toolSettings.type !== "polygon") return;
      const at = pointer(true);
      if (!at) return;
      setDraft((current) => current
        ? { ...current, data: { ...current.data, points: [...current.data.points.slice(0, -1), at, at] } }
        : draftFog([at, at], toolSettings.useFogCut));
    };
    const move = () => {
      updateGuides();
      if (toolSettings.type !== "polygon") return;
      const at = pointer(true);
      if (!at || !draft) return;
      setDraft((current) => current ? { ...current, data: { ...current.data, points: [...current.data.points.slice(0, -1), at] } } : current);
    };
    const clearGuides = () => setGuides([]);
    emitter?.on("dragStart", begin);
    emitter?.on("drag", draw);
    emitter?.on("dragEnd", complete);
    stage?.on("mousedown touchstart", move);
    stage?.on("mousemove touchmove", move);
    stage?.on("click tap", click);
    stage?.on("touchend", clearGuides);
    return () => {
      emitter?.off("dragStart", begin);
      emitter?.off("drag", draw);
      emitter?.off("dragEnd", complete);
      stage?.off("mousedown touchstart", move);
      stage?.off("mousemove touchmove", move);
      stage?.off("click tap", click);
      stage?.off("touchend", clearGuides);
    };
  });

  const completePolygon = useCallback(() => {
    if (!draft) return;
    finalize({ ...draft, data: { ...draft.data, points: draft.data.points.slice(0, -1) } });
    setDraft(null);
  }, [draft, finalize]);

  useKeyboard((event) => {
    if (shortcuts.fogFinishPolygon(event) && toolSettings.type === "polygon" && draft) completePolygon();
    if (shortcuts.fogCancelPolygon(event) && draft) setDraft(null);
    if (shortcuts.delete(event) && toolSettings.type === "polygon" && draft) {
      const points = draft.data.points;
      setDraft(points.length > 2 ? { ...draft, data: { ...draft.data, points: [...points.slice(0, -2), points[points.length - 1]] } } : null);
    }
  });

  useEffect(() => setDraft((current) => current ? { ...current, color: toolSettings.useFogCut ? "red" : "black" } : null), [toolSettings.useFogCut]);

  const includeHovered = (shape: Fog, down: boolean) => {
    if (hoverMode && down) setHovered((current) => current.some((item) => item.id === shape.id) ? current : [...current, shape]);
  };
  const appearance = (shape: Fog) => {
    const color = colors[shape.color] || shape.color;
    return { stroke: editable && active ? colors.lightGray : color, fill: new Color(color).alpha(editable ? editOpacity : 1).string(), opacity: editable ? editOpacity : 1 };
  };
  const paintShape = (shape: Fog, highlight = false) => {
    const display = highlight ? { ...shape, color: "primary" as const } : shape;
    return <FogShape key={highlight ? `hover-${shape.id}` : shape.id} fog={display} {...appearance(display)} strokeWidth={gridStrokeWidth * display.strokeWidth} fillPatternImage={patternImage} fillPriority={editable && !display.visible ? "pattern" : "color"} hitFunc={editable && !active ? () => {} : undefined} onMouseMove={(event: Konva.KonvaEventObject<MouseEvent>) => (!brushing || toolForAnyButtonEvent(event, bindings) === "fog") && includeHovered(shape, brushing)} onTouchOver={() => includeHovered(shape, brushing)} onMouseDown={(event: Konva.KonvaEventObject<MouseEvent>) => toolForAnyButtonEvent(event, bindings) === "fog" && includeHovered(shape, true)} onTouchStart={() => includeHovered(shape, true)} onMouseUp={flushHovered} onTouchEnd={flushHovered} />;
  };
  const draftView = draft && <FogShape fog={draft} {...appearance(draft)} strokeWidth={gridStrokeWidth * draft.strokeWidth} hitFunc={() => {}} />;
  const acceptTick = draft && toolSettings.type === "polygon" && draft.data.points.length > 0 && <Tick x={draft.data.points[0].x * mapWidth} y={draft.data.points[0].y * mapHeight} scale={1 / stageScale} cross={draft.data.points.length < 4} onClick={(event) => { event.cancelBubble = true; if (draft.data.points.length < 4) setDraft(null); else completePolygon(); }} />;

  return <Group><Group>{visibleFogs.map((shape) => paintShape(shape))}</Group>{showGuideLines && guides.map((guide, index) => <Line key={`${guide.orientation}-${index}`} points={[guide.start.x * mapWidth, guide.start.y * mapHeight, guide.end.x * mapWidth, guide.end.y * mapHeight]} stroke="hsl(260, 100%, 80%)" strokeWidth={gridStrokeWidth * 0.25} lineCap="round" lineJoin="round" />)}{draftView}{acceptTick}{hovered.map((shape) => paintShape(shape, true))}</Group>;
}

export default FogTool;