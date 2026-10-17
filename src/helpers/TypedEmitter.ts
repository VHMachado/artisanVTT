import EventEmitter from "./EventEmitter";

/**
 * Typed event emitter for the browser bundle.
 *
 * Replaces the `tiny-typed-emitter` package, which does
 * `require("events").EventEmitter` at module scope. Node's "events" module is
 * not available in a browser bundle without a polyfill, so that import
 * resolved to `undefined` and any `class X extends TypedEmitter` threw
 * "Class extends value undefined is not a constructor or null" while the
 * bundle was still loading — leaving the whole app blank.
 *
 * The generic parameter maps event names to their listener signatures, so
 * `emit`/`on` stay type-checked at call sites. It delegates to EventEmitter
 * rather than extending it: narrowing the inherited method signatures would
 * break their contract, which TypeScript rejects.
 */
export type ListenerSignature<L> = {
  [E in keyof L]: (...args: any[]) => any;
};

export type DefaultListener = {
  [k: string]: (...args: any[]) => any;
};

export class TypedEmitter<L extends ListenerSignature<L> = DefaultListener> {
  private emitter = new EventEmitter();

  on<E extends keyof L>(event: E, listener: L[E]): this {
    this.emitter.on(event as string | symbol, listener as any);
    return this;
  }

  off<E extends keyof L>(event: E, listener: L[E]): this {
    this.emitter.off(event as string | symbol, listener as any);
    return this;
  }

  once<E extends keyof L>(event: E, listener: L[E]): this {
    this.emitter.once(event as string | symbol, listener as any);
    return this;
  }

  emit<E extends keyof L>(event: E, ...args: Parameters<L[E]>): boolean {
    return this.emitter.emit(event as string | symbol, ...args);
  }

  setMaxListeners(maxListeners: number): this {
    this.emitter.setMaxListeners(maxListeners);
    return this;
  }
}

export default TypedEmitter;
