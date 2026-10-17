import Ajv from "ajv";
import { MapState } from "../types/MapState";
import { ColorSchema } from "./Color";
import { FogSchema } from "./Fog";
import { OutlineSchema } from "./Outline";
import { TokenStateSchema } from "./TokenState";
import { Vector2Schema } from "./Vector2";

function stateDictionary(reference: string) {
  return {
    additionalProperties: { $ref: reference },
    propertyNames: { type: "string" },
    required: [],
    type: "object",
  };
}
const mapDarkness = {
  required: ["enabled"],
  properties: {
    occlusion: { type: "boolean" },
    opacity: { type: "number" },
    enabled: { type: "boolean" },
  },
  type: "object",
};
export const MapStateSchema: any = {
  definitions: {
    FogState: stateDictionary("urn:artisan:schema:fog"),
    TokenStates: stateDictionary("urn:artisan:schema:token-state"),
    MapDarkness: mapDarkness,
  },
  properties: {
    darkness: { $ref: "#/definitions/MapDarkness" },
    mapId: { type: "string" },
    editFlags: { type: "array", items: { type: "string", enum: ["fog", "tokens"] } },
    fogs: { $ref: "#/definitions/FogState" },
    tokens: { $ref: "#/definitions/TokenStates" },
  },
  required: ["tokens", "mapId", "fogs", "editFlags"],
  type: "object",
  $id: "urn:artisan:schema:map-state",
};
const schemas = [
  MapStateSchema, FogSchema, TokenStateSchema, Vector2Schema, ColorSchema, OutlineSchema,
];
export const ajv = new Ajv({ schemas });
export const isMapState = ajv.compile<MapState>(MapStateSchema);
