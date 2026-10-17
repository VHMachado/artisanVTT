// Minimal ambient typing for the "image-outline" npm package (used by
// helpers/imageOutline.ts to trace token art edges) — upstream ships no
// types at all for this dependency, so this module augmentation exists
// purely to satisfy the TypeScript compiler.
declare module "image-outline" {
  export interface ImageOutlineOptions {
    pixelFn?: "opaque" | "not-white" | "not-black";
    opacityThreshold?: number;
    simplifyThreshold?: number;
  }

  export interface OutlinePoint {
    x: number;
    y: number;
  }

  export default function traceOutline(
    source: HTMLImageElement,
    settings: ImageOutlineOptions
  ): OutlinePoint[];
}
