import {
  type MutableRefObject,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import Konva from "konva";
import normalizeWheel from "normalize-wheel";
import { useGesture } from "react-use-gesture";
import type { Handlers } from "react-use-gesture/dist/types";

import { useBlur, useKeyboard } from "../contexts/KeyboardContext";
import type { MapStage } from "../contexts/MapStageContext";
import Vector2 from "../helpers/Vector2";
import { MouseButtonBindings, toolForDragButtons } from "../helpers/mouseBindings";
import shortcuts from "../shortcuts";

const zoomBounds = { minimum: 0.1, wheelRate: -1, pinchRate: 0.005 };

type Point = { x: number; y: number };
type ScaleListener = (scale: number) => void;
type PinchMemory = { distance: number; origin: Point };

type GestureSetup = {
  bindings: MouseButtonBindings;
  canvasInteraction: MutableRefObject<boolean>;
  gesture: Handlers;
  layerRef: RefObject<Konva.Layer>;
  maxZoom: number;
  preventInteraction: boolean;
  publishScale: ScaleListener;
  scale: number;
  speed: number;
  stageRef: MapStage;
  translationRef: MutableRefObject<Vector2>;
  pinch: MutableRefObject<PinchMemory>;
};

function capScale(value: number, maximum: number) {
  return Math.min(maximum, Math.max(zoomBounds.minimum, value));
}

function nextWheelScale(scale: number, pixelY: number, speed: number, maximum: number) {
  const adjustment = (pixelY * zoomBounds.wheelRate * scale * speed) / window.innerHeight;
  return capScale(scale + adjustment, maximum);
}

function nextPinchScale(scale: number, distance: number, speed: number, maximum: number) {
  return capScale(scale + distance * zoomBounds.pinchRate * scale * speed, maximum);
}

function translatedAround(stage: Konva.Stage, anchor: Point, before: number, after: number) {
  return {
    x: anchor.x - ((anchor.x - stage.x()) / before) * after,
    y: anchor.y - ((anchor.y - stage.y()) / before) * after,
  };
}

function publishTranslation(
  stage: Konva.Stage,
  translation: Point,
  translationRef: MutableRefObject<Vector2>,
  redraw = false
) {
  stage.position(translation);
  if (redraw) stage.draw();
  translationRef.current = translation;
}

function targetsLayerCanvas(layer: Konva.Layer | null, target: EventTarget | null) {
  return layer !== null && layer.getCanvas()._canvas === target;
}

function buildGestureHandlers(setup: GestureSetup): Handlers {
  const {
    bindings, canvasInteraction, gesture, layerRef, maxZoom, preventInteraction,
    publishScale, scale, speed, stageRef, translationRef, pinch,
  } = setup;
  const enterCanvas = (target: EventTarget | null) => {
    canvasInteraction.current = targetsLayerCanvas(layerRef.current, target);
  };
  const canChangeStage = () =>
    !preventInteraction && canvasInteraction.current && stageRef.current !== null;

  return {
    onWheelStart: (props: any) => {
      enterCanvas(props.event.target);
      gesture.onWheelStart?.(props);
    },
    onWheel: (props: any) => {
      if (!canChangeStage()) return;
      if (!props.last) {
        const stage = stageRef.current!;
        const scaleAfter = nextWheelScale(
          scale, normalizeWheel(props.event).pixelY, speed, maxZoom
        );
        const pointer = stage.getPointerPosition();
        if (pointer) {
          publishTranslation(stage, translatedAround(stage, pointer, scale, scaleAfter), translationRef);
          publishScale(scaleAfter);
        }
      }
      gesture.onWheel?.(props);
    },
    onPinchStart: (props: any) => {
      enterCanvas(props.event.target);
      const [distance] = props.da;
      const [x, y] = props.origin;
      pinch.current = { distance, origin: { x, y } };
      gesture.onPinchStart?.(props);
    },
    onPinch: (props: any) => {
      const layer = layerRef.current;
      if (!canChangeStage() || layer === null) return;
      const stage = stageRef.current!;
      const [distance] = props.da;
      const [x, y] = props.origin;
      const previous = pinch.current;
      const scaleAfter = nextPinchScale(scale, distance - previous.distance, speed, maxZoom);
      const canvas = layer.getCanvas()._canvas.getBoundingClientRect();
      const anchored = translatedAround(stage, { x: x - canvas.left, y: y - canvas.top }, scale, scaleAfter);
      const translation = {
        x: anchored.x + x - previous.origin.x,
        y: anchored.y + y - previous.origin.y,
      };
      publishTranslation(stage, translation, translationRef);
      publishScale(scaleAfter);
      pinch.current = { distance, origin: { x, y } };
      gesture.onPinch?.(props);
    },
    onDragStart: (props: any) => {
      enterCanvas(props.event.target);
      gesture.onDragStart?.(props);
    },
    onDrag: (props: any) => {
      if (!canChangeStage() || props.pinching) return;
      const stage = stageRef.current!;
      if (toolForDragButtons(props.buttons, bindings) === "move" || props.buttons > 2) {
        const [x, y] = props.delta;
        const current = stage.position();
        publishTranslation(stage, { x: current.x + x, y: current.y + y }, translationRef, true);
      }
      gesture.onDrag?.(props);
    },
  };
}

function useStageInteraction(
  stageRef: MapStage,
  stageScale: number,
  onStageScaleChange: ScaleListener,
  stageTranslateRef: MutableRefObject<Vector2>,
  layerRef: RefObject<Konva.Layer>,
  maxZoom = 10,
  bindings: MouseButtonBindings = { left: "move", right: "none" },
  preventInteraction = false,
  gesture: Handlers = {}
) {
  const canvasInteraction = useRef(false);
  const pinch = useRef<PinchMemory>({ distance: 0, origin: { x: 0, y: 0 } });
  const [zoomSpeed, setZoomSpeed] = useState(1);

  useEffect(() => {
    const cancelSafariGestureZoom = (event: Event) => event.preventDefault();
    window.addEventListener("gesturestart", cancelSafariGestureZoom);
    window.addEventListener("gesturechange", cancelSafariGestureZoom);
    return () => {
      window.removeEventListener("gesturestart", cancelSafariGestureZoom);
      window.removeEventListener("gesturechange", cancelSafariGestureZoom);
    };
  }, []);

  useGesture(
    {
      ...gesture,
      ...buildGestureHandlers({
        bindings, canvasInteraction, gesture, layerRef, maxZoom, preventInteraction,
        publishScale: onStageScaleChange, scale: stageScale, speed: zoomSpeed,
        stageRef, translationRef: stageTranslateRef, pinch,
      }),
    },
    { drag: { delay: 300 }, domTarget: window, eventOptions: { passive: false } }
  );

  useKeyboard(
    (event) => {
      const stage = stageRef.current;
      const zoomingIn = shortcuts.stageZoomIn(event);
      if (!preventInteraction && stage && (zoomingIn || shortcuts.stageZoomOut(event))) {
        const scaleAfter = nextWheelScale(stageScale, zoomingIn ? -100 : 100, zoomSpeed, maxZoom);
        publishTranslation(
          stage,
          translatedAround(stage, { x: window.innerWidth / 2, y: window.innerHeight / 2 }, stageScale, scaleAfter),
          stageTranslateRef
        );
        onStageScaleChange(scaleAfter);
      }
      if (shortcuts.stagePrecisionZoom(event)) setZoomSpeed(0.25);
    },
    (event) => {
      if (shortcuts.stagePrecisionZoom(event)) setZoomSpeed(1);
    }
  );
  useBlur(() => setZoomSpeed(1));
}

export default useStageInteraction;
