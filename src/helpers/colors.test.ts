import { describe, expect, test } from "vitest";

import colors, { colorOptions } from "./colors";

const expectedPalette = {
  blue: "rgb(26, 106, 255)",
  orange: "rgb(255, 116, 51)",
  red: "rgb(255, 77, 77)",
  yellow: "rgb(255, 212, 51)",
  purple: "rgb(136, 77, 255)",
  green: "rgb(133, 255, 102)",
  pink: "rgb(235, 138, 255)",
  teal: "rgb(68, 224, 241)",
  black: "rgb(34, 34, 34)",
  darkGray: "rgb(90, 90, 90)",
  lightGray: "rgb(179, 179, 179)",
  white: "rgb(255, 255, 255)",
  primary: "hsl(260, 100%, 80%)",
};

describe("colors", () => {
  test("exposes the complete UI palette in its established order", () => {
    expect(colors).toEqual(expectedPalette);
    expect(colorOptions).toEqual(Object.keys(expectedPalette));
  });
});
