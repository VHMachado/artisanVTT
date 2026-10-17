import Ajv from "ajv";
import { Outline } from "../types/Outline";

const outlineKinds = {
  PathOutline: {
    required: ["points", "type"],
    properties: {
      points: { type: "array", items: { type: "number" } },
      type: { type: "string", enum: ["path"] },
    },
    type: "object",
  },
  RectOutline: {
    required: ["height", "width", "y", "x", "type"],
    properties: {
      height: { type: "number" }, width: { type: "number" },
      y: { type: "number" }, x: { type: "number" },
      type: { type: "string", enum: ["rect"] },
    },
    type: "object",
  },
  CircleOutline: {
    required: ["radius", "y", "x", "type"],
    properties: {
      radius: { type: "number" }, y: { type: "number" }, x: { type: "number" },
      type: { type: "string", enum: ["circle"] },
    },
    type: "object",
  },
};
export const OutlineSchema = {
  definitions: outlineKinds,
  anyOf: Object.keys(outlineKinds).map((name) => ({ $ref: `#/definitions/${name}` })),
  $id: "urn:artisan:schema:outline",
};
export const isOutline = new Ajv().compile<Outline>(OutlineSchema);
