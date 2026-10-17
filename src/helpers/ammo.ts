/**
 * Instantiates the ammo.js physics engine.
 *
 * ammo.js ships two builds:
 *  - builds/ammo.js (asm.js, the package.json "main") — a ~1.7MB "use asm"
 *    blob that this V8/Chromium build (confirmed via isolated repro outside
 *    this project, in both a bare Edge tab and inside the Wails WebView2
 *    host) never finishes compiling: the returned promise neither resolves
 *    nor rejects and the tab pins a CPU core indefinitely.
 *  - builds/ammo.wasm.js + ammo.wasm.wasm — real WebAssembly. Instantiates
 *    in ~30ms in the same isolated repro. This is the one to use.
 *
 * Both builds are Emscripten CommonJS bundles whose factory can end with
 * `this.Ammo = d`. Under Create React App the bundle was not strict mode, so
 * a bare `Ammo()` call got the global object as `this` and the assignment
 * was harmless. ES modules — what Vite emits — are always strict mode, where
 * `this` inside a plain function call is `undefined`, so the same call threw
 * "Cannot set properties of undefined (setting 'Ammo')" and the dice tray
 * failed to load.
 *
 * Calling the factory with an explicit receiver gives that assignment
 * somewhere to land, without patching the vendored bundle.
 */
export type AmmoModuleConfig = Record<string, unknown>;
export type AmmoFactory<T = any> = (
  this: unknown,
  config?: AmmoModuleConfig
) => Promise<T>;

export function instantiateAmmo<T>(
  factory: AmmoFactory<T>,
  config?: AmmoModuleConfig
): Promise<T> {
  const receiver: Record<string, unknown> = {};
  return Promise.resolve(factory.call(receiver, config));
}

let preloadedAmmoPromise: Promise<unknown> | undefined;

/**
 * Loads and initializes the ammo.wasm.js/ammo.wasm.wasm build, caching the
 * result so the (expensive) WASM instantiation only ever runs once per page
 * load no matter how many times the dice tray is opened/closed.
 *
 * This is the actual fix for the dice tray freeze/infinite-spinner bug
 * (found via isolated headless-Chromium repros outside this app):
 *
 * Emscripten's MODULARIZE factory output returns a "thenable" module object
 * — it stashes a custom `.then` directly on the module (`f.then = function
 * (a) { ... a(f) ... }`) so consumers can `await Ammo()` even though the
 * factory itself doesn't always return a real Promise. `await`ing (or
 * `Promise.resolve()`-wrapping) that object makes the native Promise
 * implementation detect the `.then` method and "adopt" it by calling
 * `moduleObject.then(resolve, reject)` instead of settling directly. Because
 * the bundle's own `.then` immediately calls `resolve(moduleObject)` again
 * with the *same* thenable object, this produces an unbounded chain of
 * thenable-adoption microtasks: the outer promise never settles, and the
 * microtask queue never drains back to the browser's render/input loop. The
 * tab pins ~100% CPU on one core and stops responding to everything —
 * exactly the "dice tray shows a spinner forever and the window freezes"
 * symptom, and it happens *after* the WASM itself has already finished
 * compiling successfully.
 *
 * The fix avoids the trap in two ways:
 *  1. Hook the module's `onRuntimeInitialized` callback directly (the
 *     documented Emscripten completion hook) instead of relying on the
 *     module object's own thenable-adoption behavior.
 *  2. Delete `.then` off the config/module object before resolving our own
 *     promise with it, so even a fully-awaited/wrapped reference can never
 *     re-enter the adoption path.
 *
 * Passing the WASM binary in explicitly (fetched up front) and wiring
 * `instantiateWasm` to call `WebAssembly.instantiate` directly is a smaller,
 * independent robustness improvement: it avoids Emscripten's own
 * `fetch()` + `WebAssembly.instantiateStreaming()` path, which needs a
 * `Content-Type: application/wasm` response header some dev/preview servers
 * don't set (streaming compilation silently falls back to the slower
 * ArrayBuffer path in that case, but explicit instantiation skips the
 * guesswork).
 */
export function preloadAmmo<T>(
  factory: AmmoFactory<T>,
  binaryUrl: string
): Promise<T> {
  if (!preloadedAmmoPromise) {
    preloadedAmmoPromise = fetch(binaryUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Unable to load Ammo WASM (${response.status} ${response.statusText})`
          );
        }
        return response.arrayBuffer();
      })
      .then((wasmBinary) => {
        return new Promise<T>((resolve, reject) => {
          const receiver: Record<string, unknown> = {};
          const config: AmmoModuleConfig = {
            wasmBinary: new Uint8Array(wasmBinary),
            instantiateWasm(
              imports: WebAssembly.Imports,
              success: (instance: WebAssembly.Instance) => void
            ) {
              WebAssembly.instantiate(wasmBinary, imports).then(
                (result) => success(result.instance),
                (error) => reject(error)
              );
              return {};
            },
            onRuntimeInitialized() {
              // See the module-level comment above: drop the thenable
              // before resolving so nothing can adopt it and spin forever.
              delete (config as { then?: unknown }).then;
              resolve(config as unknown as T);
            },
          };
          factory.call(receiver, config);
        });
      });
  }
  return preloadedAmmoPromise as Promise<T>;
}

export default instantiateAmmo;
