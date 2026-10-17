import Ajv, { JSONSchemaType } from "ajv";
import { Color } from "../helpers/colors";

const colorNames: Color[] = [
  "black",
  "blue",
  "darkGray",
  "green",
  "lightGray",
  "orange",
  "pink",
  "primary",
  "purple",
  "red",
  "teal",
  "white",
  "yellow",
];

export const ColorSchema: JSONSchemaType<Color> = {
  $id: "urn:artisan:schema:color",
  type: "string",
  enum: colorNames,
};

const validator = new Ajv().compile<Color>(ColorSchema);
export const isColor = validator;
