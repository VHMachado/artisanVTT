import Vector2 from "./Vector2";
import { CameraState } from "../types/Camera";

export type CameraLayout = {
  stageWidth: number;
  stageHeight: number;
  mapWidth: number;
  mapHeight: number;
  /** Offset the map layer applies to centre the image, differs per window size */
  layerOffset: Vector2;
};

/**
 * Describe what the stage is currently looking at, independent of window size.
 *
 * The result is the centre of the viewport in normalised map space, where
 * (0.5, 0.5) is the middle of the map whatever the screen dimensions.
 */
export function toCameraState(
  stagePosition: Vector2,
  scale: number,
  layout: CameraLayout
): CameraState {
  const { stageWidth, stageHeight, mapWidth, mapHeight, layerOffset } = layout;
  return {
    x: (stageWidth / 2 - stagePosition.x) / scale / mapWidth - layerOffset.x / mapWidth,
    y: (stageHeight / 2 - stagePosition.y) / scale / mapHeight - layerOffset.y / mapHeight,
    scale,
  };
}

/**
 * Inverse of `toCameraState`: where this stage must sit to show the same part
 * of the map, given this viewer's own window and layer offset.
 */
export function toStagePosition(
  camera: CameraState,
  layout: CameraLayout
): Vector2 {
  const { stageWidth, stageHeight, mapWidth, mapHeight, layerOffset } = layout;
  return {
    x: stageWidth / 2 - (camera.x * mapWidth + layerOffset.x) * camera.scale,
    y: stageHeight / 2 - (camera.y * mapHeight + layerOffset.y) * camera.scale,
  };
}
