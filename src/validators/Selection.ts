import Ajv from "ajv";
import { Selection } from "../types/Select";
import { GeometrySchema } from "./Geometry";
import { Vector2Schema } from "./Vector2";

const selectionPosition = {
  required: ["y", "x", "items"],
  properties: {
    y: { type: "number" },
    x: { type: "number" },
    items: { type: "array", items: { $ref: "#/definitions/SelectionItem" } },
  },
  type: "object",
};
function selectionBranch(kind: "path" | "rectangle", geometry: string) {
  return {
    allOf: [
      { $ref: "#/definitions/BaseSelection" },
      {
        required: ["data", "type"],
        properties: {
          data: { $ref: geometry },
          type: { type: "string", enum: [kind] },
        },
        type: "object",
      },
    ],
  };
}
export const SelectionSchema = {
  definitions: {
    PathSelection: selectionBranch("path", "urn:artisan:schema:geometry#/definitions/PointsData"),
    RectSelection: selectionBranch("rectangle", "urn:artisan:schema:geometry#/definitions/RectData"),
    BaseSelection: selectionPosition,
    SelectionItem: {
      required: ["id", "type"],
      properties: {
        id: { type: "string" },
        type: { $ref: "#/definitions/SelectionItemType" },
      },
      type: "object",
    },
    SelectionItemType: { type: "string", enum: ["token"] },
  },
  anyOf: [
    { $ref: "#/definitions/PathSelection" },
    { $ref: "#/definitions/RectSelection" },
  ],
  $id: "urn:artisan:schema:selection",
};
export const isSelection = new Ajv({
  schemas: [SelectionSchema, GeometrySchema, Vector2Schema],
}).compile<Selection>(SelectionSchema);
