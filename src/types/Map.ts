import React from "react";
import { Grid } from "./Grid";

export type MapToolId =
  | "redo"
  | "undo"
  | "pointer"
  | "measure"
  | "fog"
  | "select"
  | "move"
  | "map";
export type MapTool = {
  SettingsComponent?: React.ElementType,
  title: string,
  icon: React.ReactNode,
  id: MapToolId,
};
export type BaseMap = {
  snapToGrid: boolean,
  showGrid: boolean,
  created: number,
  lastModified: number,
  height: number,
  width: number,
  grid: Grid,
  owner: string,
  name: string,
  id: string,
  /** The Mesa this map was imported into, scoping it out of every other
   * Mesa's picker (helpers/mapImport.ts's createMapFromFile stamps it;
   * SelectMapModal.tsx filters by it). Absent on every map imported
   * before this field existed — those stay visible from any Mesa rather
   * than disappearing, per the same "absent means legacy/compatible"
   * convention used elsewhere in this database (see PLAN.md). */
  tableId?: string,
};
export type DefaultMap = BaseMap & { key: string, type: "default" };
export type FileMapResolutions = {
  ultra?: string,
  high?: string,
  medium?: string,
  low?: string,
};
export type MapQuality = "original" | keyof FileMapResolutions;
export type FileMap = BaseMap & {
  quality: MapQuality,
  thumbnail: string,
  resolutions: FileMapResolutions,
  file: string,
  type: "file",
};
export type Map = FileMap | DefaultMap;
