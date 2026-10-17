import { describe, expect, it } from "vitest";

import { instantiateAmmo } from "./ammo";

describe("instantiateAmmo", () => {
  it("calls the factory with an object receiver", async () => {
    // ammo.js is an Emscripten bundle whose factory ends with `this.Ammo = d`.
    // ES modules are always strict mode, so calling it as a bare function
    // leaves `this` undefined and throws
    // "Cannot set properties of undefined (setting 'Ammo')".
    // Binding a receiver is what keeps the dice tray loading.
    let receiver: unknown = "never called";

    const factory = function (this: unknown) {
      receiver = this;
      // Mimic the real bundle's final assignment.
      (this as Record<string, unknown>).Ammo = { ok: true };
      return Promise.resolve({ ok: true });
    };

    await instantiateAmmo(factory as any);

    expect(receiver).toBeTypeOf("object");
    expect(receiver).not.toBeNull();
  });

  it("resolves to the physics engine instance", async () => {
    const engine = { destroy: () => undefined };
    const factory = function (this: unknown) {
      return Promise.resolve(engine);
    };

    await expect(instantiateAmmo(factory as any)).resolves.toBe(engine);
  });

  it("does not throw when the factory assigns onto its receiver", async () => {
    // Direct regression guard: this exact call shape threw before the fix.
    const factory = function (this: any) {
      this.Ammo = {};
      return Promise.resolve({});
    };

    await expect(instantiateAmmo(factory as any)).resolves.toBeDefined();
  });

  it("forwards an optional module config to the factory", async () => {
    let receivedConfig: unknown;
    const factory = function (this: any, config?: unknown) {
      receivedConfig = config;
      return Promise.resolve({});
    };

    const config = { locateFile: () => "" };
    await instantiateAmmo(factory as any, config);

    expect(receivedConfig).toBe(config);
  });
});
