import { describe, expect, test } from "vitest";

import { ColorSchema, isColor } from "./Color";

const expectedColors = [
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

describe("ColorSchema", () => {
  test("keeps its public identifier and complete color enumeration", () => {
    expect(ColorSchema).toMatchObject({
      $id: "urn:artisan:schema:color",
      enum: expectedColors,
      type: "string",
    });
  });

  test.each(expectedColors)("accepts %s", (color) => {
    expect(isColor(color)).toBe(true);
  });

  test.each(["magenta", "", 1, null, {}])("rejects invalid color %j", (color) => {
    expect(isColor(color)).toBe(false);
  });
});
