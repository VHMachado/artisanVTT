import Konva from "konva";
import { useEffect, useRef } from "react";

import Vector2 from "../helpers/Vector2";
import { MapStage } from "../contexts/MapStageContext";

type ImageData = {
  id: string;
  width: number;
  height: number;
};

type FittedSize = { width: number; height: number; fitsToHeight: boolean };

/** Scales `data` to fill the stage on whichever axis is the tighter
 * constraint, preserving aspect ratio; falls back to the stage's own
 * dimensions while no image data has loaded yet. */
function fitImageToStage(
  data: ImageData | null,
  stageWidth: number,
  stageHeight: number
): FittedSize {
  const fitsToHeight =
    stageWidth / stageHeight > (data ? data.width / data.height : 1);
  if (!data) {
    return { width: stageWidth, height: stageHeight, fitsToHeight };
  }
  return fitsToHeight
    ? {
        width: stageHeight / (data.height / data.width),
        height: stageHeight,
        fitsToHeight,
      }
    : {
        width: stageWidth,
        height: stageWidth * (data.height / data.width),
        fitsToHeight,
      };
}

/** The translate that re-centers a fitted image's layer inside `container`. */
function centeringTranslate(fitted: FittedSize, container: DOMRect): Vector2 {
  return fitted.fitsToHeight
    ? { x: -(fitted.width - container.width) / 2, y: 0 }
    : { x: 0, y: -(fitted.height - container.height) / 2 };
}

/** Everything a Konva stage view owns that recentering needs to touch —
 * grouped so `useImageCenter`'s call sites pass one object instead of
 * four positionally-ordered refs/setters that are easy to transpose by
 * accident. */
type StageHandles = {
  stageRef: MapStage;
  imageLayerRef: React.RefObject<Konva.Layer>;
  containerRef: React.RefObject<HTMLDivElement>;
  stageTranslateRef: React.MutableRefObject<Vector2>;
  setStageScale: React.Dispatch<React.SetStateAction<number>>;
};

/** Snaps every stage handle back to its untransformed origin and applies
 * `translate` to the image layer — the one write path both a fresh image
 * and a responsive resize fall through to. */
function recenterStage(
  handles: StageHandles,
  layer: Konva.Layer,
  stage: Konva.Stage,
  translate: Vector2
) {
  layer.position(translate);
  stage.position({ x: 0, y: 0 });
  handles.stageTranslateRef.current = { x: 0, y: 0 };
  handles.setStageScale(1);
}

/**
 * Computes the width/height an image should render at to fit inside the
 * stage while preserving its aspect ratio, and (on id change, or on any
 * resize when `responsive`) recenters the stage/layer on it.
 */
function useImageCenter(
  data: ImageData | null,
  stageWidth: number,
  stageHeight: number,
  handles: StageHandles,
  responsive = false
) {
  const stageRatio = stageWidth / stageHeight;
  const fitted = fitImageToStage(data, stageWidth, stageHeight);

  // Bundled into one ref so a fresh image and a stage resize are both
  // just "did either tracked value change since last run", instead of
  // two separately-named booleans computed from two separate refs.
  const previousRef = useRef({ dataId: data?.id, stageRatio });

  useEffect(() => {
    if (!data) {
      return;
    }

    const layer = handles.imageLayerRef.current;
    const container = handles.containerRef.current;
    const stage = handles.stageRef.current;
    if (!container || !stage) {
      return;
    }

    const changed = previousRef.current.dataId !== data.id;
    const resized = previousRef.current.stageRatio !== stageRatio;
    if (layer && (changed || (responsive && resized))) {
      recenterStage(
        handles,
        layer,
        stage,
        centeringTranslate(fitted, container.getBoundingClientRect())
      );
    }

    previousRef.current = { dataId: data.id, stageRatio };
  });

  return [fitted.width, fitted.height];
}

export default useImageCenter;
