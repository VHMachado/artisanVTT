# Dice Tray hang investigation — state as of 2026-09-14

## Status: RESOLVED. Root cause found and fixed — see "FINAL ROOT CAUSE" section below.

## FINAL ROOT CAUSE (2026-09-14, later session): Ammo.js Emscripten module is a "thenable" — resolving a promise with it causes infinite thenable-adoption microtask chaining

The hang was isolated, with an isolated headless-Chromium repro outside this
app (no React/Babylon at all), to `ammo.wasm.js`'s Emscripten MODULARIZE
factory output. That factory stashes a custom `.then` directly onto the
module object it returns (`f.then = function(a){ ... a(f) ... }`) so
consumers can `await Ammo()` even when the factory call itself doesn't return
a real Promise.

The old `instantiateAmmo()` wrapped the factory's return value in
`Promise.resolve(...)`. Because the returned object has a `.then` method,
the native Promise implementation treats it as a **thenable** and "adopts"
it — instead of settling directly, it calls `moduleObject.then(resolve2,
reject2)`. The bundle's own `.then` implementation immediately calls
`resolve2(moduleObject)` again, handing back the *same* thenable object. The
adoption logic sees another thenable and repeats: this produces an unbounded
chain of thenable-adoption microtasks. The promise never settles, and
because microtasks run to exhaustion before control returns to the browser's
render/input event loop, the renderer's main thread never yields again. The
tab pins ~100% CPU on one core and stops responding to *everything*
(clicks, `Runtime.evaluate`, `Page.captureScreenshot`, even
`Debugger.pause`) — exactly the "dice tray shows a spinner forever and the
whole window freezes" symptom reported by the user.

Critically, this happens **after** the WASM module itself has already
compiled and instantiated successfully — `WebAssembly.instantiate()`
resolves in a few milliseconds every time, `instantiateWasm`'s `success()`
callback runs fine, and even `onRuntimeInitialized` fires. The hang is
entirely in how the *result* gets threaded back out to the caller via
`await`/`Promise.resolve()`, not in WASM compilation, WebGL context
creation, or GPU driver work. All of the following turned out to be red
herrings investigated and ruled out along the way:
- TF.js/WebGL context contention with Babylon.js (see below — disproven
  independently; kept as an unrelated minor improvement).
- `WebAssembly.instantiateStreaming()`/missing `Content-Type: application/wasm`
  header on the dev/preview server (real, but not the cause of the hang —
  fixed as a minor independent robustness improvement).
- Multiple concurrent WebGL contexts on the page (ruled out — an isolated
  probe with two live WebGL2 contexts alongside Ammo init did not hang).
- `--disable-gpu` / headless Chromium quirks (ruled out — reproduced with
  and without `--disable-gpu`, and in a real, non-headless Edge originally).

### Fix (`src/helpers/ammo.ts`, `preloadAmmo()`)

1. Fetch the `.wasm` binary explicitly and pass it in via `wasmBinary` +
   a custom `instantiateWasm` callback that calls `WebAssembly.instantiate`
   directly, bypassing Emscripten's own `fetch()` +
   `WebAssembly.instantiateStreaming()` path (an independent, smaller
   robustness fix — see the streaming section further down).
2. Resolve the wrapping promise from the module's `onRuntimeInitialized`
   callback (Emscripten's documented direct completion hook) instead of
   relying on `await`ing/`Promise.resolve()`-wrapping the module object's
   own thenable behavior.
3. `delete config.then` right before resolving, so even a caller that later
   awaits the resolved value again can never re-enter the thenable-adoption
   trap.
4. Cache the resulting promise at module scope (`preloadedAmmoPromise`) so
   the (still non-trivial) WASM instantiation only happens once per page
   load, no matter how many times the dice tray is opened/closed.

### Verification

Reproduced and then confirmed fixed via fully non-interactive, headless
Chromium automation (no visible window, no physical mouse/keyboard, no
window-focus stealing — see "Non-intrusive automation" note near the bottom
of this doc):
- Before the fix: page navigates, game loads, dice tray button clicks fire,
  console log stops dead after `[ammo.ts] success() returned` /
  `onRuntimeInitialized called` — `document.readyState` eval via CDP times
  out, `Get-Process msedge` shows one PID's CPU time climbing continuously.
- After the fix: full `[DICE_DIAG]` log sequence completes — Ammo resolves,
  `Engine created`, `enablePhysics() done`, dice tray meshes/textures load,
  `heartbeat: DiceInteraction render loop alive` logs continuously for
  60+ seconds with no gaps, and `document.title` eval via CDP returns
  immediately at every point during and after tray load. `yarn tsc --noEmit`,
  `yarn test` (24/24 passing, all suites), and `yarn build` all pass.

## UPDATE (same day, earlier in this session): Ammo WASM initialization race isolated; TF.js hypothesis was unrelated to the actual lock

Applied the leading hypothesis fix from the previous session: forced
`GridSizeModel` (`src/ml/gridSize/GridSizeModel.ts`) to use
`tf.setBackend("cpu")` instead of the default WebGL backend, so grid
detection never creates a WebGL context that could contend with Babylon.js's.
`yarn tsc --noEmit` and `yarn build` both pass.

**Re-ran the full reproduction recipe below (vite preview + real Edge + real
mouse clicks via UI Automation, CDP console capture) and the hang still
happens** — but this run **never loaded a map at all** (Start Game → Start,
straight to the empty Party page, then clicked "Show Dice Tray" directly).
`GridSizeModel.predict()` is only called from `src/helpers/map.ts` when a map
image is added — it did not run in this reproduction. **This proves the
TF.js/WebGL-context-contention hypothesis is not the (sole) root cause**: the
hang reproduces on a path that never touches TensorFlow.js or its WebGL
context at all. The CPU-backend fix should stay (it's a legitimate
improvement — that one-shot inference never needed WebGL — and it may still
matter for whatever the *original* multi-canvas finding was about), but it
does not fix this hang by itself.

**New, more precise characterization of the hang** (previously mischaracterized
as an async stall — this session found it's actually a synchronous main-thread
lock):
- Log stopped dead right after `loadMeshes: singleAlbedoTexture start` (i.e.
  right after `new Texture(singleAlbedo, ...)` is constructed in
  `importTextureAsync`, `src/helpers/babylon.ts`). No further `[DICE_DIAG]`
  lines, including no further `heartbeat:` lines (which log at most every
  2000ms from the render loop) — meaning JS execution in that renderer
  process never returns to the event loop/rAF callback again.
- `Get-Process msedge | Select CPU` showed the renderer process's CPU time
  climbing continuously and linearly (~130 CPU-seconds and rising, sampled
  3s apart) — a genuine busy loop, not an idle/blocked-on-IO wait.
- **CDP `Runtime.evaluate` on a trivial synchronous expression
  (`document.querySelectorAll("canvas").length`) never returns a response.**
  Neither does `Page.captureScreenshot`. Neither does `Debugger.pause` (no
  `Debugger.paused` event ever arrives, even given 10+ seconds). This is the
  key new fact: a real async stall (event never fires) would still let CDP
  eval trivial synchronous JS between renders, and `Debugger.pause` would
  always succeed by definition (it interrupts at the next JS statement
  boundary or immediately if already in JS). Both failing means the renderer's
  main thread is stuck **inside a single synchronous execution** that never
  yields — either a tight JS loop, or a long/blocking synchronous native call
  (e.g. inside a WebGL driver call, image decode, or Ammo WASM call) that
  Chromium can't preempt.
- This is NOT the same failure mode the previous session documented (`img`
  `load`/`error` never firing — an async stall where the event loop keeps
  running fine, just that particular callback never comes). Either (a) this
  is a *different* bug that looks similar from the UI (spinner stuck forever)
  but has a different cause, or (b) the previous session's diagnosis was
  itself incomplete/wrong (e.g. CDP eval was tested working via a *different*
  page/tab context, or was tested before the actual hang point was reached).
  Don't assume they're the same bug going forward — verify independently.

### Next steps (updated)
1. **Do not trust CDP `Runtime.evaluate`/`Page.captureScreenshot` as a
   liveness probe during this hang — they hang too.** Use OS-level CPU
   sampling (`Get-Process | Select CPU` sampled twice, a few seconds apart)
   as the liveness/deadlock signal instead.
2. Since CDP can't interrupt the hang, get a stack via a different route:
   - `chrome://tracing` / `--trace-startup` capturing *before* the hang
     happens (start tracing right after clicking "Show Dice Tray", the trace
     buffer should capture the moment it locks up).
   - Or a Windows-level sampling profiler attached to the specific renderer
     PID (e.g. via `procdump` full/mini dump at the moment CPU is observed
     climbing, then inspect the dump's stack — no need for Chrome's own
     debugger to cooperate).
   - Or bisect by commenting out pieces of `loadMeshes()` /
     `importTextureAsync` (e.g. try `new Image()` + manual
     `Texture.LoadFromDataString` instead of the plain URL constructor path)
     to narrow which exact call inside texture creation is looping.
3. Re-test the ORIGINAL "img onload/onerror never fires" async-stall
   diagnosis from the previous session in isolation, now that we know CDP eval
   can itself hang — confirm it's really an async stall (CDP eval succeeds
   while stalled) and not this same sync lock, before continuing to treat it
   as a separate confirmed fact.
4. The "2 canvases already present when DiceInteraction mounts" finding from
   the previous session is still unexplained and still worth identifying
   (what are they, on a page with no map loaded?) — instrument
   `logCanvasState` to log each canvas's id/class/width/height, not just the
   count, and capture that BEFORE opening the dice tray (so it's captured
   even if the tray then hangs).

## Original investigation (previous session, superseded in part by the update above)

## Status: NOT RESOLVED. Root cause narrowed but not fixed.

## TL;DR for whoever picks this up
The dice tray hang (`RenderProcessUnresponsive` in Wails/WebView2) is
**100% reproducible without Wails/WebView2 at all** — plain Microsoft Edge,
`vite preview` build, real mouse clicks. So this is NOT a WebView2/GPU-driver
issue. It's caused by something in how Vite bundles/schedules the app
differently from webpack/CRA (the `main` branch works fine, confirmed by the
user, on the same machine).

## Confirmed facts (do not re-litigate these — re-verified multiple times this session)

1. **Not WebView2/GPU-driver specific.** Reproduced hang in plain Edge with
   `vite preview --port 4199` serving the production build, no Wails involved.
2. **Not a code bug in DiceTray/Dice/DiceInteraction.** An isolated repro
   (`C:/tmp/vite-babylon-repro`) replicating the *exact* same sequence —
   Ammo.js WASM physics, `loadWalls()`, `loadMeshes()` with sequential
   texture loading, PBR materials, GalaxyDice.load() running in parallel via
   the `sceneReadyPromise` race-guard — loads everything in under ~900ms,
   every time, no hang. Only the real app hangs.
3. **The exact failure point**: `FileTools.LoadImage` (babylonjs/core/Misc/fileTools.js)
   creates `new Image()`, sets `img.crossOrigin = "anonymous"`, sets `img.src = url`
   — and then **neither the `load` nor the `error` event ever fires**. Confirmed
   by instrumenting `node_modules/@babylonjs/core/Misc/fileTools.js` directly
   (temporary `window.__diceDiag(...)` calls — see "Instrumentation left in
   place" below) and capturing real console output via CDP with real mouse
   clicks (UI Automation `InvokePattern.Invoke()` does NOT reliably trigger
   React's real onClick — always use real `SendInput`/`mouse_event`, see
   `C:/tmp/real-click-edge.ps1`).
4. **New finding this session, not yet followed up**: when `DiceInteraction`
   mounts (`logCanvasState("DiceInteraction mount")`), **there are already 2
   `<canvas>` elements in the DOM** before the dice tray creates its own third
   one. Candidates: the Konva map canvas, and/or a TensorFlow.js WebGL context
   from the grid-detection model (`src/ml/gridSize/GridSizeModel.ts`, dynamic
   `import("@tensorflow/tfjs")`). This TF.js WebGL context retention +
   concurrent Babylon.js WebGL context creation is the leading hypothesis for
   why image decoding never completes (browser image decode can silently stall
   under GPU/compositor contention in some Chromium builds).
5. Isolated download of the same JPGs via `curl` and via a bare `new Image()`
   in the same page — both succeed in single-digit milliseconds. So it is not
   a network/CORS issue.
6. Confirmed (again) `resetDiceCaches()`, the `sceneDisposedRef` guards, and
   `createPolynomials=false` fixes from earlier in the investigation are all
   real, correct, and still in the code — they fixed *different*, real bugs
   found earlier, but did NOT fix this one.
7. User confirmed this bug **only appeared after the CRA→Vite migration** —
   it does not happen on `main` (webpack/CRA) on the same machine. So the
   cause is a bundler/runtime timing difference, not hardware/driver.

## Leading hypothesis (untested, next step)

Vite/Rollup isolates `@babylonjs/core` (physics, loaders, dice tray) into one
big lazy-loaded chunk (`React.lazy(() => import("../dice/DiceTrayOverlay"))`),
and `@tensorflow/tfjs` is separately dynamically imported
(`GridSizeModel.tf = await import("@tensorflow/tfjs")`). Webpack/CRA likely
chunks/schedules these differently (different chunk boundaries, different
module execution order, possibly different WebGL context creation/GC timing).
The hypothesis: **TensorFlow.js retains a WebGL context (from grid detection
on map load) that contends with the Babylon.js WebGL context for dice**, and
under Vite's bundling this contention manifests as the browser's native image
decode pipeline stalling forever (never firing load/error) — a known class of
Chromium behavior under GPU/compositor resource pressure.

### Next steps to test this hypothesis
1. Open a map (triggering `GridSizeModel`/TF.js grid detection) vs. not
   opening one, then open the dice tray both ways — does the hang only happen
   when TF.js has run?
2. Check `WebGLRenderingContext` count via `document.querySelectorAll('canvas')`
   + attempt `getContext` on each BEFORE opening the dice tray, in both the
   hang and non-hang cases, to see if TF.js's canvas is actually WebGL-backed
   and still holds a live context.
3. Try disposing/releasing the TensorFlow.js backend (`tf.disposeVariables()`,
   `tf.engine().reset()`, or literally deferring/lazy-mounting the grid model
   until after any dice tray use) and see if the hang disappears.
4. If confirmed, the fix is likely one of: (a) dispose the TF.js WebGL context
   when not actively grid-detecting, (b) force Babylon.js's `Engine` to reuse
   a single shared WebGL context/canvas instead of creating a new one per
   dice-tray-open, or (c) delay dice tray's `Engine` creation until TF.js is
   idle.
5. If NOT confirmed (TF.js not involved), the two pre-existing canvases need
   to be identified by iterating `document.querySelectorAll('canvas')` and
   inspecting each one's context type/owner component — instrument
   `logCanvasState` (already in `src/helpers/diagnostics.ts`) to log more than
   just the count (e.g. each canvas's id/class/dimensions).

## Reproduction recipe (fastest path to reproduce, no Wails needed)

```bash
# In owlbear-wails-spike worktree:
yarn build
npx vite preview --port 4199
# Open http://localhost:4199/ in a real browser (not headless — needs real GPU/compositor)
# Start Game -> (toggle "Use password" off if it defaults on, since there's no password set) -> Start
# Click the "+"-ish icon button top-right of the map = "Show Dice Tray"
# It will hang deterministically within ~1-2 clicks of opening (not always the very first time in this session's tests — sometimes takes a reopen).
```

For automated/scripted reproduction with real mouse clicks + CDP console capture:
- `C:/tmp/real-click-edge.ps1` — real mouse click via `user32.dll` `SetCursorPos`/`mouse_event`
  targeting `-ProcessName msedge` (or `artisan-desktop` for the packaged Wails exe).
  **UI Automation `InvokePattern.Invoke()` is NOT reliable — always use this script's real-click approach.**
- `C:/tmp/vite-babylon-repro/watch_console.cjs "<ws:// CDP url>"` — streams console
  output via CDP `Runtime.consoleAPICalled`, run via
  `powershell Start-Process ... -RedirectStandardOutput <logfile> -WindowStyle Hidden`
  (background=true in the terminal tool doesn't reliably keep long-lived node
  processes alive across tool calls in this environment — use PowerShell
  Start-Process instead).
- Get the page's CDP websocket URL: `curl http://127.0.0.1:<port>/json/list`
  and find the entry with `"type": "page"` and the app's title/url (multiple
  browser-extension background pages will also be listed — ignore those).

## Instrumentation currently left in the code (temporary, should be removed once root-caused)

- `src/helpers/diagnostics.ts`: `logDiagnostic`, `heartbeat`, `installGlobalDiagnostics`
  (installs `window.__diceDiag`, a global error/unhandledrejection listener,
  and a `MutationObserver` logging DOM mutation counts every ~1s), `logCanvasState`
  (logs `document.querySelectorAll('canvas').length`).
- `src/components/dice/DiceInteraction.tsx`: calls `logDiagnostic`/`heartbeat`/
  `logCanvasState` at mount/cleanup, tracks `mountCounterRef` to detect
  React remounts.
- `node_modules/@babylonjs/core/Misc/fileTools.js` (**NOT tracked by git,
  will be wiped by any `yarn install`/`npm install`** — re-apply if needed):
  added `window.__diceDiag(...)` calls inside `FileTools.LoadImage` at:
  function entry, right after `new Image()`/`SetCorsBehavior`, and inside
  `noOfflineSupport()` right before `img.src = url` is set. This is what
  proved the `load`/`error` events never fire.
- All of this logs to the browser console AND (if `window.runtime.LogInfo`
  exists, i.e. running under the real Wails exe) to `dice-diagnostics.log`
  next to the exe. `desktop/main.go` has `LogLevelProduction: logger.DEBUG`
  set (needed for `LogInfo` to not be suppressed in production Wails builds).

## Things already tried and ruled out (do not re-try these)

- Ammo.js asm.js vs WASM build — WASM is correct, already in place.
- `resetDiceCaches()` for static dice mesh/material caches across Scene
  disposals — real bug, already fixed, not the current one.
- `sceneDisposedRef`/`disposed` guards against touching a disposed Babylon
  Scene from late-resolving promises — real bug, already fixed, not this one.
- `createPolynomials=false` on `CubeTexture.CreateFromPrefilteredData` (was
  doing a heavy sync spherical-harmonics computation) — real fix, not this one.
- CORS / `crossOrigin=anonymous` on textures — ruled out by isolated `Image()` test.
- Sequential vs `Promise.all` texture loading — doesn't matter, isolated repro
  hangs neither way (i.e. isolated repro never hangs at all).
- Duplicate `@babylonjs/core`/`ThinEngine` bundled twice, causing
  `_FileToolsLoadImage` to be set on the "wrong" copy — checked, only one
  `_FileToolsLoadImage` occurrence in the built JS, ruled out.
- CDP `--remote-debugging-port` on the packaged Wails exe — inaccessible in
  this sandboxed environment via any tested method (env var, registry,
  `setx`). Use `window.runtime.LogInfo` -> `dice-diagnostics.log` file instead
  for the packaged exe, or just test against `vite preview` + real Edge (much
  faster iteration, and the bug reproduces there too — no need to rebuild the
  Wails exe for most of this investigation).
- Zombie duplicate processes / stale WebSocket connections from previous test
  runs skewing results — always fully kill `msedge`/`node`/`artisan-desktop.exe`
  processes between test runs (`powershell -Command "Get-Process msedge,node,artisan-desktop.exe -ErrorAction SilentlyContinue | Stop-Process -Force"`).

## Repo state
- Branch: `wails-spike` in the repo's own worktree.
- `main` branch is untouched, per explicit user instruction — do not touch it.
- `yarn typecheck`, `yarn build` both pass with current instrumentation in place.
- The `node_modules/@babylonjs/core/Misc/fileTools.js` patch is NOT persisted
  (node_modules isn't tracked) — if you need to re-confirm the LoadImage
  stall, re-apply the `window.__diceDiag` calls described above.
