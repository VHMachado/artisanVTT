import Ajv from "ajv";
import { Fog } from "../types/Fog";
import { ColorSchema } from "./Color";
import { Vector2Schema } from "./Vector2";

const coordinateRing = {
  type: "array",
  items: { $ref: "urn:artisan:schema:vector2" },
};
const fogData = {
  properties: {
    holes: { type: "array", items: coordinateRing },
    points: coordinateRing,
  },
  required: ["holes", "points"],
  type: "object",
};
export const FogSchema = {
  definitions: { FogData: fogData },
  properties: {
    visible: { type: "boolean" },
    type: { type: "string", enum: ["fog"] },
    strokeWidth: { type: "number" },
    id: { type: "string" },
    data: { $ref: "#/definitions/FogData" },
    color: { $ref: "urn:artisan:schema:color" },
  },
  required: ["visible", "type", "strokeWidth", "id", "data", "color"],
  type: "object",
  $id: "urn:artisan:schema:fog",
};
const schemas = [FogSchema, ColorSchema, Vector2Schema];
export const isFog = new Ajv({ schemas }).compile<Fog>(FogSchema);
