import Vector2 from "../helpers/Vector2";

export type PointsData = {
  points: Vector2[];
};

export type RectData = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CircleData = {
  x: number;
  y: number;
  radius: number;
};

export type ShapeData = PointsData | RectData | CircleData;
export type ShapeType = "line" | "rectangle" | "circle" | "triangle";
