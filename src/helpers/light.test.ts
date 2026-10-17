import { describe, expect, test } from "vitest";

import {
  coneRotation,
  isLightActive,
  lightPixelRadius,
  maxLightAngle,
  maxLightRadius,
  minLightAngle,
  normalizeMapDarkness,
  normalizeTokenLight,
} from "./light";

import { defaultTokenLight } from "../types/TokenState";
import type { TokenLight } from "../types/TokenState";

describe("normalizeTokenLight", () => {
  test("undefined falls back to the default torch", () => {
    expect(normalizeTokenLight(undefined)).toEqual(defaultTokenLight);
  });

  test("fills in missing fields from the default", () => {
    const partial = { radius: 2 } as TokenLight;
    expect(normalizeTokenLight(partial)).toEqual({
      ...defaultTokenLight,
      radius: 2,
    });
  });

  test("clamps radius into range", () => {
    const light = normalizeTokenLight({
      radius: -5,
      shape: "circle",
      angle: 90,
      enabled: true,
    });
    expect(light.radius).toBe(0);

    const tooLarge = normalizeTokenLight({
      radius: 9999,
      shape: "circle",
      angle: 90,
      enabled: true,
    });
    expect(tooLarge.radius).toBe(maxLightRadius);
  });

  test("clamps the cone angle into range", () => {
    expect(
      normalizeTokenLight({
        radius: 4,
        shape: "cone",
        angle: 0,
        enabled: true,
      }).angle
    ).toBe(minLightAngle);
    expect(
      normalizeTokenLight({
        radius: 4,
        shape: "cone",
        angle: 720,
        enabled: true,
      }).angle
    ).toBe(maxLightAngle);
  });

  test("an unknown shape degrades to circle", () => {
    const light = normalizeTokenLight({
      radius: 4,
      shape: "triangle" as any,
      angle: 90,
      enabled: true,
    });
    expect(light.shape).toBe("circle");
  });

  test("a non-finite number degrades to the default rather than NaN", () => {
    const light = normalizeTokenLight({
      radius: NaN,
      shape: "circle",
      angle: NaN,
      enabled: true,
    });
    expect(light.radius).toBe(defaultTokenLight.radius);
    expect(light.angle).toBe(defaultTokenLight.angle);
  });
});

describe("isLightActive", () => {
  test("no light at all is inactive", () => {
    expect(isLightActive(undefined)).toBe(false);
  });

  test("a disabled light is inactive", () => {
    expect(
      isLightActive({
        radius: 4,
        shape: "circle",
        angle: 90,
        enabled: false,
      })
    ).toBe(false);
  });

  test("a zero-radius light paints nothing and is inactive", () => {
    expect(
      isLightActive({
        radius: 0,
        shape: "circle",
        angle: 90,
        enabled: true,
      })
    ).toBe(false);
  });

  test("a configured, enabled light is active", () => {
    expect(isLightActive(defaultTokenLight)).toBe(true);
  });
});

describe("lightPixelRadius", () => {
  test("multiplies the cell radius by the grid cell size", () => {
    const radius = lightPixelRadius(
      {
        radius: 3,
        shape: "circle",
        angle: 90,
        enabled: true,
      },
      40
    );
    expect(radius).toBe(120);
  });

  test("applies the same clamp as normalizeTokenLight", () => {
    const radius = lightPixelRadius(
      {
        radius: 9999,
        shape: "circle",
        angle: 90,
        enabled: true,
      },
      10
    );
    expect(radius).toBe(maxLightRadius * 10);
  });
});

describe("coneRotation", () => {
  test("a token at rotation 0 (facing down) centres its cone downward", () => {
    // Konva's Wedge starts at its rotation and sweeps clockwise by angle,
    // with 0 pointing right. "Down" is +90, so a 90° cone centred down
    // must start at 45.
    expect(coneRotation(0, 90)).toBe(45);
  });

  test("the cone follows the token's own rotation", () => {
    expect(coneRotation(90, 90)).toBe(135);
    expect(coneRotation(180, 90)).toBe(225);
  });

  test("a wider cone starts further back so it stays centred", () => {
    expect(coneRotation(0, 180)).toBe(0);
    expect(coneRotation(0, 360)).toBe(-90);
  });
});

describe("normalizeMapDarkness", () => {
  test("undefined means darkness is off", () => {
    expect(normalizeMapDarkness(undefined).enabled).toBe(false);
  });

  test("keeps enabled true when already set", () => {
    expect(normalizeMapDarkness({ enabled: true })).toEqual({
      enabled: true,
      opacity: 1,
      occlusion: true,
    });
  });

  // Oclusão por paredes do fog.
  test("occlusion ausente conta como ligada (mapState pré-oclusão)", () => {
    expect(normalizeMapDarkness({ enabled: true }).occlusion).toBe(true);
  });

  test("occlusion explicitamente false é respeitada", () => {
    expect(
      normalizeMapDarkness({ enabled: true, occlusion: false }).occlusion
    ).toBe(false);
  });

  test("occlusion explicitamente true é respeitada", () => {
    expect(
      normalizeMapDarkness({ enabled: true, occlusion: true }).occlusion
    ).toBe(true);
  });

  // Intensidade: removida e depois restaurada a pedido do usuário. O
  // default 1 preserva o comportamento do pedido anterior ("sempre 100%")
  // para todo mapState escrito enquanto o campo não existia.
  test("opacity ausente conta como 1 (escuridão total)", () => {
    expect(normalizeMapDarkness({ enabled: true }).opacity).toBe(1);
  });

  test("opacity é clampada em 0..1", () => {
    expect(normalizeMapDarkness({ enabled: true, opacity: 5 }).opacity).toBe(1);
    expect(normalizeMapDarkness({ enabled: true, opacity: -1 }).opacity).toBe(
      0
    );
  });

  test("opacity intermediária é preservada", () => {
    expect(
      normalizeMapDarkness({ enabled: true, opacity: 0.5 }).opacity
    ).toBe(0.5);
  });

  test("opacity não-finita degrada para 1 em vez de NaN", () => {
    expect(
      normalizeMapDarkness({ enabled: true, opacity: NaN }).opacity
    ).toBe(1);
  });
});
