import Ajv, { JSONSchemaType } from "ajv";
import Vector2 from "../helpers/Vector2";

const coordinateFields = {
  y: { type: "number" },
  x: { type: "number" },
} as const;
export const Vector2Schema: JSONSchemaType<Vector2> = {
  required: ["y", "x"],
  properties: coordinateFields,
  type: "object",
  $id: "urn:artisan:schema:vector2",
};
const ajv = new Ajv();
export const isVector2 = ajv.compile<Vector2>(Vector2Schema);
