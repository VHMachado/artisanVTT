import { describe, expect, test, vi } from "vitest";

import { disposeDiceMeshes } from "./diceMeshCleanup";

describe("disposeDiceMeshes", () => {
  test("cancels sleepers and removes every d100 mesh from shadows before dispose", () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const main = { dispose: () => order.push("dispose-main") } as any;
    const percentile = { dispose: () => order.push("dispose-d10") } as any;
    const removeShadowCaster = vi.fn((mesh) =>
      order.push(mesh === main ? "remove-main" : "remove-d10")
    );
    const sleepTimeout = setTimeout(() => order.push("timeout-fired"), 1000);

    disposeDiceMeshes(
      [
        {
          type: "d100",
          instance: main,
          d10Instance: percentile,
          asleep: false,
          sleepTimeout,
        },
      ],
      { removeShadowCaster }
    );
    vi.runAllTimers();

    expect(order).toEqual([
      "remove-main",
      "dispose-main",
      "remove-d10",
      "dispose-d10",
    ]);
    expect(removeShadowCaster).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
