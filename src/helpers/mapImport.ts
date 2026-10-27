import Case from "case";
import { v4 as uuid } from "uuid";

import blobToBuffer from "./blobToBuffer";
import { createThumbnail, resizeImage } from "./image";
import {
  DEFAULT_GRID_SIZE,
  getGridDefaultInset,
  getGridDetectionFromImage,
  getGridDetectionInset,
  gridSizeVaild,
} from "./grid";
import Vector2 from "./Vector2";

import { Asset } from "../types/Asset";
import { FileMap, FileMapResolutions, Map } from "../types/Map";

type Resolution = { size: number; quality: number; id: "low" | "medium" | "high" | "ultra" };

type ImportedMap = { map: Map; assets: Asset[] };

const resolutions: Resolution[] = [
  { id: "low", size: 30, quality: 0.5 },
  { id: "medium", size: 70, quality: 0.6 },
  { id: "high", size: 140, quality: 0.7 },
  { id: "ultra", size: 300, quality: 0.8 },
];

function previewFor({ quality, resolutions }: FileMap): string | undefined {
  if (quality === "medium") return resolutions.low;
  if (quality === "high" || quality === "ultra") return resolutions.medium;
  if (quality === "original") return resolutions.medium ?? resolutions.low;
  return undefined;
}

export function getMapPreviewAsset(map: Map): string | undefined {
  return map.type === "file" ? previewFor(map) : undefined;
}

function nameAndGrid(image: HTMLImageElement, fileName: string) {
  let gridSize: Vector2 | undefined;
  let gridDetection: ReturnType<typeof getGridDetectionFromImage> | undefined;

  for (const match of fileName.matchAll(/(\d+) ?(x|X) ?(\d+)/g)) {
    const width = Number.parseInt(match[1], 10);
    const height = Number.parseInt(match[3], 10);
    if (gridSizeVaild(width, height)) gridSize = { x: width, y: height };
  }

  if (!gridSize) {
    gridDetection = getGridDetectionFromImage(image);
    gridSize = gridDetection?.size;
  }

  const name = Case.capital(
    fileName
      .replace(/\.[^/.]+$/, "")
      .replace(/(\[ ?|\( ?)?\d+ ?(x|X) ?\d+( ?\]| ?\))?/, "")
      .replace(/ +/g, " ")
      .trim()
  );
  return { name, gridSize: gridSize ?? DEFAULT_GRID_SIZE, gridDetection };
}

async function buildResolutionAssets(
  image: HTMLImageElement,
  gridSize: Vector2,
  mime: string,
  owner: string
): Promise<{ resolutions: FileMapResolutions; assets: Asset[] }> {
  const assets: Asset[] = [];
  const mapResolutions: FileMapResolutions = {};

  for (const resolution of resolutions) {
    const pixelSize = Vector2.multiply(gridSize, resolution.size);
    if (image.width < pixelSize.x || image.height < pixelSize.y) continue;
    const imageAsset = await resizeImage(image, Vector2.componentMax(pixelSize), mime, resolution.quality);
    if (!imageAsset) continue;

    const id = uuid();
    mapResolutions[resolution.id] = id;
    assets.push({ ...imageAsset, id, owner });
  }
  return { resolutions: mapResolutions, assets };
}

async function withImage(file: File, callback: (image: HTMLImageElement, buffer: Uint8Array) => Promise<ImportedMap>) {
  const buffer = await blobToBuffer(file);
  const url = URL.createObjectURL(new Blob([buffer.buffer]));
  const image = new Image();

  return new Promise<ImportedMap>((resolve, reject) => {
    image.onload = () => callback(image, buffer).then(resolve, reject).finally(() => URL.revokeObjectURL(url));
    image.onerror = reject;
    image.src = url;
  });
}

export function createMapFromFile(file: File, userId: string, tableId?: string): Promise<ImportedMap> {
  return withImage(file, async (image, buffer) => {
    const { name, gridSize, gridDetection } = nameAndGrid(image, file.name || "Unknown Map");
    const generated = await buildResolutionAssets(image, gridSize, file.type, userId);
    const thumbnail = await createThumbnail(image, file.type);
    const thumbnailId = uuid();
    const assets = [...generated.assets];
    if (thumbnail) assets.push({ ...thumbnail, id: thumbnailId, owner: userId });

    const original = {
      id: uuid(),
      file: buffer,
      width: image.width,
      height: image.height,
      mime: file.type,
      owner: userId,
    };
    assets.push(original);

    const map: FileMap = {
      id: uuid(),
      name,
      type: "file",
      file: original.id,
      thumbnail: thumbnailId,
      resolutions: generated.resolutions,
      grid: {
        size: gridSize,
        inset: gridDetection
          ? getGridDetectionInset(gridDetection, image.width, image.height)
          : getGridDefaultInset({ size: gridSize, type: "square" }, image.width, image.height),
        type: "square",
        measurement: { type: "chebyshev", scale: "1.5m" },
      },
      width: image.width,
      height: image.height,
      owner: userId,
      created: Date.now(),
      lastModified: Date.now(),
      showGrid: false,
      snapToGrid: true,
      quality: "original",
      tableId,
    };
    return { map, assets };
  });
}

/** Keeps a map visible in a Mesa's picker when it was imported INTO that
 * Mesa (`tableId` matches) or predates per-Mesa scoping altogether
 * (`tableId` absent) — see `BaseMap.tableId`'s doc comment for why
 * untagged maps are never hidden. */
export function filterMapsForTable(maps: Map[], tableId: string): Map[] {
  return maps.filter((map) => !map.tableId || map.tableId === tableId);
}
