import { describe, expect, it, vi } from "vitest";

import TypedEmitter from "./TypedEmitter";

interface TestEvents {
  ping: (value: number) => void;
  pong: (label: string, flag: boolean) => void;
}

describe("TypedEmitter", () => {
  it("is a constructor that can be extended", () => {
    // Guards the regression that broke the Vite build: `tiny-typed-emitter`
    // resolved to undefined in the browser because it require()s Node's
    // "events" module, so `class X extends TypedEmitter` threw at load time.
    expect(typeof TypedEmitter).toBe("function");

    class Emitter extends TypedEmitter<TestEvents> {}
    expect(() => new Emitter()).not.toThrow();
    expect(new Emitter()).toBeInstanceOf(TypedEmitter);
  });

  it("delivers emitted arguments to listeners", () => {
    class Emitter extends TypedEmitter<TestEvents> {}
    const emitter = new Emitter();
    const listener = vi.fn();

    emitter.on("ping", listener);
    emitter.emit("ping", 42);

    expect(listener).toHaveBeenCalledWith(42);
  });

  it("supports multiple arguments and several events", () => {
    class Emitter extends TypedEmitter<TestEvents> {}
    const emitter = new Emitter();
    const pong = vi.fn();

    emitter.on("pong", pong);
    emitter.emit("pong", "label", true);

    expect(pong).toHaveBeenCalledWith("label", true);
  });

  it("stops calling a listener after off()", () => {
    class Emitter extends TypedEmitter<TestEvents> {}
    const emitter = new Emitter();
    const listener = vi.fn();

    emitter.on("ping", listener);
    emitter.off("ping", listener);
    emitter.emit("ping", 1);

    expect(listener).not.toHaveBeenCalled();
  });

  it("calls a once() listener a single time", () => {
    class Emitter extends TypedEmitter<TestEvents> {}
    const emitter = new Emitter();
    const listener = vi.fn();

    emitter.once("ping", listener);
    emitter.emit("ping", 1);
    emitter.emit("ping", 2);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(1);
  });
});
