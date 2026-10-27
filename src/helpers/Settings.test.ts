import { beforeEach, describe, expect, test } from "vitest";

import Settings from "./Settings";

/**
 * The regression this guards: a device with nothing stored yet reads
 * version "none". Comparing a step number against `undefined` is always
 * false, so every migration was skipped and `getAll()` kept returning
 * `null` — the first component to read `settings.map` then crashed the
 * whole app to a blank screen. A fresh install has to run the chain from
 * step 1.
 */
describe("Settings", () => {
  const name = "SettingsTest";

  beforeEach(() => {
    localStorage.removeItem(name);
  });

  test("runs the whole migration chain on a device with nothing stored", () => {
    const settings = new Settings(name);

    settings.version(1, () => ({ first: true }));
    settings.version(2, (previous) => ({ ...previous, second: true }));

    expect(settings.getAll()).toMatchObject({
      first: true,
      second: true,
      __version: 2,
    });
  });

  test("skips migrations already applied to the stored blob", () => {
    const first = new Settings(name);
    first.version(1, () => ({ value: "from step 1" }));

    const second = new Settings(name);
    second.version(1, () => ({ value: "should not run again" }));
    second.version(2, (previous) => ({ ...previous, extra: true }));

    expect(second.getAll()).toMatchObject({
      value: "from step 1",
      extra: true,
      __version: 2,
    });
  });
});
