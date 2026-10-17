import { describe, expect, it } from "vitest";

import { chooseLocalPhase, detectGrid } from "./gridDetection";

/**
 * Synthetic maps exercise the two failure modes that mattered in practice:
 * reporting a MULTIPLE of the real cell size (what the replaced CNN pipeline
 * did), and reporting a confident grid for an image that has none.
 *
 * The real-map validation was recorded separately and cannot
 * live here because the fixtures are the user's copyrighted map art, which the
 * repository does not carry.
 */

type Rgba = { data: Uint8ClampedArray; width: number; height: number };

/** Blank canvas of a single luma value */
function blank(width: number, height: number, value = 160): Rgba {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  return { data, width, height };
}

/** Deterministic pseudo-random noise, so a flaky test can never be luck */
function addNoise(image: Rgba, amplitude: number, seed = 1): Rgba {
  let state = seed;
  for (let i = 0; i < image.data.length; i += 4) {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state |= 0;
    const delta = ((state >>> 8) / 0xffffff - 0.5) * 2 * amplitude;
    for (let c = 0; c < 3; c++) {
      image.data[i + c] = Math.max(0, Math.min(255, image.data[i + c] + delta));
    }
  }
  return image;
}

/** Draws a square lattice of the given pitch at the given opacity */
function drawGrid(
  image: Rgba,
  pitch: number,
  {
    value = 40,
    alpha = 1,
    width: lineWidth = 1,
    offset = 0,
    verticalPitch = pitch,
    horizontalPitch = pitch,
  } = {}
): Rgba {
  const { data, width, height } = image;
  const blend = (index: number) => {
    for (let c = 0; c < 3; c++) {
      data[index + c] = data[index + c] * (1 - alpha) + value * alpha;
    }
  };
  for (let x = offset; x < width; x += verticalPitch) {
    for (let w = 0; w < lineWidth; w++) {
      const column = Math.round(x) + w;
      if (column < 0 || column >= width) continue;
      for (let y = 0; y < height; y++) blend((y * width + column) * 4);
    }
  }
  for (let y = offset; y < height; y += horizontalPitch) {
    for (let w = 0; w < lineWidth; w++) {
      const row = Math.round(y) + w;
      if (row < 0 || row >= height) continue;
      for (let x = 0; x < width; x++) blend((row * width + x) * 4);
    }
  }
  return image;
}

/** Draws only one orientation of otherwise grid-like lines */
function drawLines(
  image: Rgba,
  pitch: number,
  orientation: "horizontal" | "vertical"
): Rgba {
  const { data, width, height } = image;
  for (let line = 0; line < (orientation === "vertical" ? width : height); line += pitch) {
    for (let across = 0; across < (orientation === "vertical" ? height : width); across++) {
      const index =
        orientation === "vertical" ? (across * width + line) * 4 : (line * width + across) * 4;
      data[index] = data[index + 1] = data[index + 2] = 40;
    }
  }
  return image;
}

/** Draws a locally tiled room; its seams deliberately stop at the walls */
function drawTiledRoom(
  image: Rgba,
  left: number,
  top: number,
  roomWidth: number,
  roomHeight: number,
  pitch: number,
  offsetX = 0,
  offsetY = 0
): Rgba {
  const { data, width } = image;
  const right = left + roomWidth;
  const bottom = top + roomHeight;
  const darken = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    data[index] = data[index + 1] = data[index + 2] = 40;
  };
  for (let x = left + offsetX; x < right; x += pitch) {
    for (let y = top; y < bottom; y++) darken(x, y);
  }
  for (let y = top + offsetY; y < bottom; y += pitch) {
    for (let x = left; x < right; x++) darken(x, y);
  }
  return image;
}

/** Smooth 2-D wallpaper: periodic in both axes, but it contains no seams */
function drawSineChecker(image: Rgba, pitch: number): Rgba {
  const { data, width, height } = image;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value =
        128 + 55 * Math.sin((2 * Math.PI * x) / pitch) * Math.sin((2 * Math.PI * y) / pitch);
      const index = (y * width + x) * 4;
      data[index] = data[index + 1] = data[index + 2] = value;
    }
  }
  return image;
}

/** Separable 2-D wallpaper has line-like ridges but no narrow seams */
function drawSineWallpaper(image: Rgba, pitch: number): Rgba {
  const { data, width, height } = image;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value =
        128 +
        27.5 * (Math.sin((2 * Math.PI * x) / pitch) + Math.sin((2 * Math.PI * y) / pitch));
      const index = (y * width + x) * 4;
      data[index] = data[index + 1] = data[index + 2] = value;
    }
  }
  return image;
}

/** Locally rephased smooth wallpaper must not become grout in the patch fallback */
function drawRephasedSineWallpaper(image: Rgba, pitch: number): Rgba {
  const { data, width, height } = image;
  const patch = 192;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const phaseX = ((Math.floor(x / patch) + 2 * Math.floor(y / patch)) % 5) * 4;
      const phaseY = ((2 * Math.floor(x / patch) + Math.floor(y / patch)) % 5) * 4;
      const value =
        128 +
        27.5 *
          (Math.sin((2 * Math.PI * (x + phaseX)) / pitch) +
            Math.sin((2 * Math.PI * (y + phaseY)) / pitch));
      const index = (y * width + x) * 4;
      data[index] = data[index + 1] = data[index + 2] = value;
    }
  }
  return image;
}

describe("chooseLocalPhase", () => {
  it("keeps the local anchor below the 8% global-evidence threshold", () => {
    expect(chooseLocalPhase(9, 100, { phase: 11, energy: 107.999 })).toBe(9);
  });

  it("adopts the global phase at the exact 8% threshold", () => {
    expect(chooseLocalPhase(9, 100, { phase: 11, energy: 108 })).toBe(11);
  });

  it("refines axes independently and never replaces an anchor without energy", () => {
    expect(chooseLocalPhase(12, 100, { phase: 14, energy: 105 })).toBe(12);
    expect(chooseLocalPhase(9, 100, { phase: 11, energy: 110 })).toBe(11);
    expect(chooseLocalPhase(9, null, { phase: 11, energy: 1000 })).toBe(9);
  });
});

describe("detectGrid", () => {
  it("finds the pitch of a clean dark lattice", () => {
    const result = detectGrid(
      ...(([img]) => [img.data, img.width, img.height] as const)([
        drawGrid(blank(800, 600), 40),
      ])
    );
    expect(result).not.toBeNull();
    expect(result!.pitch).toBeCloseTo(40, 0);
    expect(result!.size).toEqual({ x: 20, y: 15 });
  });

  it("derives the cell count from the image dimensions", () => {
    // Non-square image: both axes must report the same cell SIZE, which then
    // gives different cell COUNTS per axis.
    const img = drawGrid(blank(1000, 600), 40);
    const result = detectGrid(img.data, img.width, img.height);
    expect(result!.size).toEqual({ x: 25, y: 15 });
  });

  it("finds a light lattice on a dark map", () => {
    const img = drawGrid(blank(800, 600, 30), 40, { value: 220 });
    const result = detectGrid(img.data, img.width, img.height);
    expect(result).not.toBeNull();
    expect(result!.pitch).toBeCloseTo(40, 0);
  });

  it("reports the cell size, never a multiple of it", () => {
    // The regression this phase exists for: the replaced pipeline returned a
    // grid 2x too coarse per axis on a map whose grid was drawn in the texture.
    for (const pitch of [25, 32, 40, 50, 64]) {
      const img = drawGrid(blank(960, 960), pitch);
      const result = detectGrid(img.data, img.width, img.height);
      expect(result, `pitch ${pitch}`).not.toBeNull();
      expect(result!.pitch, `pitch ${pitch}`).toBeCloseTo(pitch, 0);
    }
  });

  it("is not fooled by every other line being stronger", () => {
    // A map with emphasised 5-cell boundaries still has 1-cell spacing.
    const img = drawGrid(blank(900, 900), 30, { value: 120 });
    drawGrid(img, 150, { value: 20 });
    const result = detectGrid(img.data, img.width, img.height);
    expect(result!.pitch).toBeCloseTo(30, 0);
  });

  it("survives noise over the lattice", () => {
    const img = addNoise(drawGrid(blank(800, 600), 40, { alpha: 0.5 }), 18);
    const result = detectGrid(img.data, img.width, img.height);
    expect(result).not.toBeNull();
    expect(result!.pitch).toBeCloseTo(40, 0);
  });

  it("finds a faint low-opacity lattice", () => {
    const img = drawGrid(blank(800, 600), 40, { alpha: 0.2 });
    const result = detectGrid(img.data, img.width, img.height);
    expect(result).not.toBeNull();
    expect(result!.pitch).toBeCloseTo(40, 0);
  });

  it("handles a lattice that does not start at the origin", () => {
    const img = drawGrid(blank(800, 600), 40, { offset: 13 });
    const result = detectGrid(img.data, img.width, img.height);
    expect(result!.pitch).toBeCloseTo(40, 0);
    expect(result!.phase.x).toBeCloseTo(13, 0);
    expect(result!.phase.y).toBeCloseTo(13, 0);
  });

  it("handles a 2px line width", () => {
    const img = drawGrid(blank(800, 600), 48, { width: 2 });
    const result = detectGrid(img.data, img.width, img.height);
    expect(result!.pitch).toBeCloseTo(48, 0);
  });

  it("finds a repeated floor-tile pitch across disconnected rooms", () => {
    const img = blank(960, 720);
    // Each seam ends at a room wall, unlike a VTT grid line that spans the
    // whole canvas. Their shared 24px pitch remains measurable in both axes.
    drawTiledRoom(img, 48, 48, 264, 216, 24, 7, 11);
    drawTiledRoom(img, 432, 96, 288, 192, 24, 7, 11);
    drawTiledRoom(img, 264, 408, 240, 216, 24, 7, 11);

    const result = detectGrid(img.data, img.width, img.height);
    expect(result).not.toBeNull();
    expect(result!.pitch).toBeCloseTo(24, 0);
    expect(result?.size).toEqual({ x: 40, y: 30 });
    expect(result?.phase).toEqual({ x: 7, y: 11 });
  });

  it("finds tiled rooms whose local grout phases disagree", () => {
    const img = blank(960, 720);
    // Independent floor textures have the same cell size but cannot share one
    // image-wide phase. This exercises the local-consensus fallback.
    drawTiledRoom(img, 32, 32, 264, 240, 24, 0, 0);
    drawTiledRoom(img, 376, 64, 288, 216, 24, 9, 13);
    drawTiledRoom(img, 192, 376, 264, 240, 24, 17, 5);
    drawTiledRoom(img, 600, 408, 288, 216, 24, 4, 19);
    addNoise(img, 4);

    const result = detectGrid(img.data, img.width, img.height);
    expect(result).not.toBeNull();
    expect(result!.source).toBe("floorTiles");
    expect(result!.pitch).toBeGreaterThan(20);
    expect(result!.pitch).toBeLessThan(26);
  });

  it("rejects smooth periodic wallpaper rather than inventing tile seams", () => {
    const img = drawSineChecker(blank(960, 720), 24);
    expect(detectGrid(img.data, img.width, img.height)).toBeNull();
  });

  it("rejects separable periodic wallpaper rather than mistaking broad ridges for lines", () => {
    const img = drawSineWallpaper(blank(960, 720), 24);
    expect(detectGrid(img.data, img.width, img.height)).toBeNull();
  });

  it("rejects locally rephased smooth wallpaper in the patch fallback", () => {
    const img = drawRephasedSineWallpaper(blank(960, 720), 24);
    expect(detectGrid(img.data, img.width, img.height)).toBeNull();
  });

  it("returns null for a single-axis line train", () => {
    // Stripes, floorboards, ruled paper and window panes are not a 2-D lattice.
    for (const orientation of ["horizontal", "vertical"] as const) {
      const img = drawLines(blank(800, 600), 40, orientation);
      expect(detectGrid(img.data, img.width, img.height), orientation).toBeNull();
    }
  });

  it("returns null when the axes disagree on cell size", () => {
    const img = drawGrid(blank(800, 600), 40, { horizontalPitch: 50 });
    expect(detectGrid(img.data, img.width, img.height)).toBeNull();
  });

  it("returns null for a flat image with no lattice", () => {
    const img = blank(800, 600);
    expect(detectGrid(img.data, img.width, img.height)).toBeNull();
  });

  it("returns null for pure noise rather than inventing a grid", () => {
    const img = addNoise(blank(800, 600), 60, 7);
    expect(detectGrid(img.data, img.width, img.height)).toBeNull();
  });

  it("returns null for a gradient, which is smooth but not periodic", () => {
    const img = blank(800, 600);
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        const v = (x / img.width) * 200 + 20;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      }
    }
    expect(detectGrid(img.data, img.width, img.height)).toBeNull();
  });

  it("rejects an image too small to hold a grid", () => {
    const img = blank(32, 32);
    expect(detectGrid(img.data, img.width, img.height)).toBeNull();
  });

  it("rejects a lattice too coarse to be a battle-map grid", () => {
    // 3 cells across is below the plausible range, so nothing is claimed.
    const img = drawGrid(blank(600, 600), 200);
    expect(detectGrid(img.data, img.width, img.height)).toBeNull();
  });

  it("stays fail-closed at the short-axis cell-count boundary", () => {
    // The full-line fit needs more than ten complete samples after filtering.
    // Floor-tile detection additionally needs three spatially independent seam
    // runs, so an exactly-ten-cell edge case is deliberately left unchanged
    // instead of turning weak evidence into a confident VTT grid.
    const img = drawGrid(blank(1000, 500), 50);
    expect(detectGrid(img.data, img.width, img.height)).toBeNull();
  });

  it("is scale invariant: the same map at two sizes gives the same cell count", () => {
    const big = drawGrid(blank(1200, 900), 60);
    const small = drawGrid(blank(600, 450), 30);
    const a = detectGrid(big.data, big.width, big.height);
    const b = detectGrid(small.data, small.width, small.height);
    expect(a!.size).toEqual(b!.size);
  });

  it("reports a sub-pixel straight-line fit for a real lattice", () => {
    const img = drawGrid(blank(800, 600), 40);
    const result = detectGrid(img.data, img.width, img.height);
    expect(result!.rms).toBeLessThan(1);
    expect(result!.lines).toBeGreaterThanOrEqual(8);
  });
});
