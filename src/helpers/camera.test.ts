import { describe, expect, it } from "vitest";

import { toCameraState, toStagePosition, CameraLayout } from "./camera";

/** A 1600x900 window showing a map letterboxed to the stage width */
const gmLayout: CameraLayout = {
  stageWidth: 1600,
  stageHeight: 900,
  mapWidth: 1600,
  mapHeight: 1200,
  layerOffset: { x: 0, y: -150 },
};

/** A different player on a smaller, differently shaped window */
const playerLayout: CameraLayout = {
  stageWidth: 800,
  stageHeight: 800,
  mapWidth: 800,
  mapHeight: 600,
  layerOffset: { x: 0, y: 100 },
};

describe("camera", () => {
  it("round trips a position through the same layout", () => {
    const position = { x: -320, y: -240 };
    const scale = 1.5;
    const camera = toCameraState(position, scale, gmLayout);
    const restored = toStagePosition(camera, gmLayout);
    expect(restored.x).toBeCloseTo(position.x, 6);
    expect(restored.y).toBeCloseTo(position.y, 6);
  });

  it("describes the centre of the map as 0.5, 0.5 whatever the window", () => {
    // Position the stage so the middle of the map sits in the middle of the view
    for (const layout of [gmLayout, playerLayout]) {
      const scale = 1;
      const position = {
        x: layout.stageWidth / 2 - (0.5 * layout.mapWidth + layout.layerOffset.x) * scale,
        y: layout.stageHeight / 2 - (0.5 * layout.mapHeight + layout.layerOffset.y) * scale,
      };
      const camera = toCameraState(position, scale, layout);
      expect(camera.x).toBeCloseTo(0.5, 6);
      expect(camera.y).toBeCloseTo(0.5, 6);
    }
  });

  it("shows the same point of the map on a different sized screen", () => {
    // The GM looks at a point one quarter across and three quarters down
    const target = { x: 0.25, y: 0.75 };
    const scale = 2;
    const gmPosition = toStagePosition({ ...target, scale }, gmLayout);
    const camera = toCameraState(gmPosition, scale, gmLayout);

    // The player applies it against their own layout
    const playerPosition = toStagePosition(camera, playerLayout);

    // Whatever lands in the centre of the player's viewport should be the same
    // normalised map point the GM was centred on
    const playerCamera = toCameraState(playerPosition, camera.scale, playerLayout);
    expect(playerCamera.x).toBeCloseTo(target.x, 6);
    expect(playerCamera.y).toBeCloseTo(target.y, 6);
  });

  it("carries the zoom level across unchanged", () => {
    const camera = toCameraState({ x: 10, y: 20 }, 3.25, gmLayout);
    expect(camera.scale).toBe(3.25);
  });
});
