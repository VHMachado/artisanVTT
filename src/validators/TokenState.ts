import Ajv from "ajv";
import { TokenState } from "../types/TokenState";

import { ColorSchema } from "./Color";
import { OutlineSchema } from "./Outline";

const baseTokenFields = {
  y: { type: "number" },
  x: { type: "number" },
  width: { type: "number" },
  visible: { type: "boolean" },
  tokenId: { type: "string" },
  statuses: { type: "array", items: { $ref: "urn:artisan:schema:color" } },
  size: { type: "number" },
  rotation: { type: "number" },
  owner: { type: "string" },
  outline: { $ref: "urn:artisan:schema:outline" },
  locked: { type: "boolean" },
  lastModifiedBy: { type: "string" },
  lastModified: { type: "number" },
  label: { type: "string" },
  id: { type: "string" },
  height: { type: "number" },
  hp: { $ref: "#/definitions/TokenHp" },
  light: { $ref: "#/definitions/TokenLight" },
  npcId: { type: "string" },
  characterId: { type: "string" },
  category: { $ref: "#/definitions/TokenCategory" },
};
const baseTokenState = {
  required: [
    "y", "x", "width", "visible", "tokenId", "statuses", "size", "rotation",
    "owner", "outline", "locked", "lastModifiedBy", "lastModified", "label", "id",
    "height", "category",
  ],
  properties: baseTokenFields,
  type: "object",
};
function tokenStateKind(kind: "default" | "file", field: "key" | "file") {
  return {
    allOf: [
      { $ref: "#/definitions/BaseTokenState" },
      {
        required: ["type", field],
        properties: {
          type: { type: "string", enum: [kind] },
          [field]: { type: "string" },
        },
        type: "object",
      },
    ],
  };
}
export const TokenStateSchema = {
  definitions: {
    FileTokenState: tokenStateKind("file", "file"),
    DefaultTokenState: tokenStateKind("default", "key"),
    BaseTokenState: baseTokenState,
    TokenHp: {
      required: ["max", "current"],
      properties: { max: { type: "number" }, current: { type: "number" } },
      type: "object",
    },
    TokenLight: {
      required: ["enabled", "angle", "shape", "radius"],
      properties: {
        enabled: { type: "boolean" }, angle: { type: "number" },
        shape: { type: "string", enum: ["cone", "circle"] }, radius: { type: "number" },
      },
      type: "object",
    },
    TokenCategory: { type: "string", enum: ["attachment", "vehicle", "prop", "character"] },
  },
  anyOf: [
    { $ref: "#/definitions/FileTokenState" },
    { $ref: "#/definitions/DefaultTokenState" },
  ],
  $id: "urn:artisan:schema:token-state",
};

export const ajv = new Ajv({
  schemas: [TokenStateSchema, ColorSchema, OutlineSchema],
});

export const isTokenState = ajv.compile<TokenState>(TokenStateSchema);
