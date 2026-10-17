import { describe, expect, test } from "vitest";

import { ColorSchema } from "./Color";
import { FogSchema } from "./Fog";
import { GeometrySchema } from "./Geometry";
import { MapStateSchema } from "./MapState";
import { OutlineSchema } from "./Outline";
import { SelectionSchema } from "./Selection";
import { TokenStateSchema } from "./TokenState";
import { Vector2Schema } from "./Vector2";

const schemas = {
  color: ColorSchema,
  fog: FogSchema,
  geometry: GeometrySchema,
  "map-state": MapStateSchema,
  outline: OutlineSchema,
  selection: SelectionSchema,
  "token-state": TokenStateSchema,
  vector2: Vector2Schema,
};

describe("Artisan schema identifiers", () => {
  test("names every bundled schema with the Artisan URN namespace", () => {
    for (const [name, schema] of Object.entries(schemas)) {
      expect(schema.$id).toBe(`urn:artisan:schema:${name}`);
    }
  });
});
