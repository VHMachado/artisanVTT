import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./blobToBuffer", () => ({
  default: vi.fn(async () => new Uint8Array()),
}));

vi.mock("./image", () => ({
  resizeImage: vi.fn(async () => undefined),
  createThumbnail: vi.fn(async () => undefined),
}));

vi.mock("./grid", async () => {
  const actual = await vi.importActual<typeof import("./grid")>("./grid");
  return { ...actual, getGridDetectionFromImage: vi.fn(() => null) };
});

import { createMapFromFile } from "./map";
import { DEFAULT_GRID_SIZE, getGridDetectionFromImage } from "./grid";

class LoadedImage {
  width = 800;
  height = 600;
  onload: (() => void) | null = null;
  onerror: ((event: Event | string) => void) | null = null;

  set src(_value: string) {
    this.onload?.();
  }
}

describe("createMapFromFile", () => {
  const originalImage = globalThis.Image;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  afterEach(() => {
    globalThis.Image = originalImage;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.clearAllMocks();
  });

  it("uses DEFAULT_GRID_SIZE when the pixel detector finds no lattice", async () => {
    globalThis.Image = LoadedImage as unknown as typeof Image;
    URL.createObjectURL = vi.fn(() => "blob:map");
    URL.revokeObjectURL = vi.fn();

    const file = {
      name: "plain-map.png",
      type: "image/png",
      arrayBuffer: async () => new ArrayBuffer(0),
    } as File;

    const { map } = await createMapFromFile(file, "user-1");

    expect(getGridDetectionFromImage).toHaveBeenCalledTimes(1);
    expect(map.grid.size).toEqual(DEFAULT_GRID_SIZE);
    expect(map.grid.type).toBe("square");
  });

  it("preserves a detected non-zero grid phase on a new import", async () => {
    globalThis.Image = LoadedImage as unknown as typeof Image;
    URL.createObjectURL = vi.fn(() => "blob:map");
    URL.revokeObjectURL = vi.fn();
    vi.mocked(getGridDetectionFromImage).mockReturnValueOnce({
      source: "lattice",
      pitch: 40,
      phase: { x: 13, y: 7 },
      size: { x: 20, y: 15 },
      score: 10,
      rms: 0.2,
      lines: 15,
    });

    const file = {
      name: "offset-grid.png",
      type: "image/png",
      arrayBuffer: async () => new ArrayBuffer(0),
    } as File;

    const { map } = await createMapFromFile(file, "user-1");

    expect(map.grid.size).toEqual({ x: 20, y: 15 });
    expect(map.grid.inset).toEqual({
      topLeft: { x: 13 / 800, y: 7 / 600 },
      bottomRight: { x: 813 / 800, y: 607 / 600 },
    });
  });
});
