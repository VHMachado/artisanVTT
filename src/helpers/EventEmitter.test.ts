import { describe, expect, it, vi } from "vitest";

import EventEmitter from "./EventEmitter";

describe("EventEmitter", () => {
  it("notifies listeners and removes them with off", () => {
    const emitter = new EventEmitter();
    const listener = vi.fn();

    emitter.on("event", listener);
    emitter.emit("event", "value");
    emitter.off("event", listener);
    emitter.emit("event", "ignored");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("value");
  });

  it("removes a once listener after the first notification", () => {
    const emitter = new EventEmitter();
    const listener = vi.fn();

    emitter.once("event", listener);
    emitter.emit("event");
    emitter.emit("event");

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
