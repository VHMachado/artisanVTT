import imageOutline from "image-outline";

import blobToBuffer from "./blobToBuffer";
import Vector2 from "./Vector2";

import { Outline } from "../types/Outline";

export type CanvasImage = { file: Uint8Array; width: number; height: number; mime: string };

function rectangleFor(image: HTMLImageElement): Outline {
  return { type: "rect", x: 0, y: 0, width: image.width, height: image.height };
}

function roundedPath(points: Vector2[]): number[] {
  return points.flatMap(({ x, y }) => [Math.round(x), Math.round(y)]);
}

export function classifyOutline(points: Vector2[]): Outline {
  const bounds = Vector2.getBoundingBox(points);
  if (Vector2.rectangular(points)) {
    return { type: "rect", x: Math.round(bounds.min.x), y: Math.round(bounds.min.y), width: Math.round(bounds.width), height: Math.round(bounds.height) };
  }
  if (Vector2.circular(points, Math.max(bounds.width, bounds.height) / 10)) {
    return { type: "circle", x: Math.round(bounds.center.x), y: Math.round(bounds.center.y), radius: Math.round(Math.min(bounds.width, bounds.height) / 2) };
  }
  return { type: "path", points: roundedPath(points) };
}

function usableOutline(image: HTMLImageElement, points: Vector2[]): boolean {
  const bounds = Vector2.getBoundingBox(points);
  return bounds.width * bounds.height >= image.width * image.height * 0.05;
}

export function getImageLightness(image: HTMLImageElement): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) return false;

  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  let balance = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    balance += Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) >= 128 ? 1 : -1;
  }
  return balance / (image.width * image.height) + 0.1 >= 0;
}

export function canvasToImage(canvas: HTMLCanvasElement, type: string, quality: number): Promise<CanvasImage | undefined> {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return resolve(undefined);
      resolve({ file: await blobToBuffer(blob), width: canvas.width, height: canvas.height, mime: type });
    }, type, quality);
  });
}

function canvasFor(width: number, height: number): HTMLCanvasElement | undefined {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext("2d") ? canvas : undefined;
}

export async function resizeImage(image: HTMLImageElement, size: number, type: string, quality: number): Promise<CanvasImage | undefined> {
  const horizontal = image.width > image.height;
  const ratio = image.width / image.height;
  const canvas = canvasFor(horizontal ? size : Math.round(size * ratio), horizontal ? Math.round(size / ratio) : size);
  if (!canvas) return undefined;
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvasToImage(canvas, type, quality);
}

export async function createThumbnail(image: HTMLImageElement, type: string, size = 300, quality = 0.5): Promise<CanvasImage | undefined> {
  const canvas = canvasFor(size, size);
  if (!canvas) return undefined;
  const context = canvas.getContext("2d")!;
  if (image.width > image.height) {
    const sourceX = image.width / 2 - image.height / 2;
    context.drawImage(image, sourceX, 0, image.height, image.height, 0, 0, size, size);
  } else {
    const sourceY = image.height / 2 - image.width / 2;
    context.drawImage(image, 0, sourceY, image.width, image.width, 0, 0, size, size);
  }
  return canvasToImage(canvas, type, quality);
}

export function getImageOutline(image: HTMLImageElement, maxPoints = 100): Outline {
  const fallback = rectangleFor(image);
  try {
    const raw = imageOutline(image, { opacityThreshold: 1 });
    if (!raw || raw.length === 0) return fallback;
    const points = raw.length > maxPoints ? Vector2.resample(raw, maxPoints) : raw;
    return usableOutline(image, points) ? classifyOutline(points) : fallback;
  } catch {
    return fallback;
  }
}
