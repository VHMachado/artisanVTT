import { describe, expect, it, vi, beforeEach } from "vitest";
import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom";

// DiceInteraction creates a Babylon Engine/Scene per mount. Since the dice
// tray is now lazily mounted (only while the tray is open), closing and
// reopening it mounts a fresh DiceInteraction each time. If the previous
// Engine/Scene/render loop is never disposed, every reopen leaves another
// WebGL context and render loop running forever, which is exactly the
// "spinner freezes the window" regression: enough leaked render loops choke
// the main thread until the page stops responding.
const disposeEngine = vi.fn();
const disposeScene = vi.fn();
const runRenderLoop = vi.fn();
const resize = vi.fn();

vi.mock("@babylonjs/core/Engines/engine", () => ({
  Engine: vi.fn().mockImplementation(() => ({
    dispose: disposeEngine,
    runRenderLoop,
    resize,
  })),
}));

vi.mock("@babylonjs/core/scene", () => ({
  Scene: vi.fn().mockImplementation(() => ({
    dispose: disposeScene,
    clearColor: undefined,
    createPickingRay: vi.fn(),
    pick: vi.fn(),
    pointerX: 0,
    pointerY: 0,
    deltaTime: 16,
    enablePhysics: vi.fn(),
  })),
}));

vi.mock("@babylonjs/core/Maths/math", () => ({
  Vector3: Object.assign(
    vi.fn().mockImplementation((x, y, z) => ({ x, y, z })),
    { Zero: () => ({ x: 0, y: 0, z: 0 }) }
  ),
  Color4: vi.fn(),
  Matrix: { Identity: vi.fn() },
}));

vi.mock("@babylonjs/core/Physics/Plugins/ammoJSPlugin", () => ({
  AmmoJSPlugin: vi.fn(),
}));

vi.mock("@babylonjs/core/Cameras/targetCamera", () => ({
  TargetCamera: vi.fn().mockImplementation(() => ({
    fov: 0,
    setTarget: vi.fn(),
    globalPosition: { y: 0 },
  })),
}));

const resolvedAmmoLib = { btVector3: vi.fn() };
vi.mock("ammo.js/builds/ammo.wasm.js", () => ({ default: vi.fn() }));
vi.mock("ammo.js/builds/ammo.wasm.wasm?url", () => ({
  default: "ammo.wasm.wasm",
}));
vi.mock("../../helpers/ammo", () => ({
  default: vi.fn(() => Promise.resolve(resolvedAmmoLib)),
  preloadAmmo: vi.fn(() => Promise.resolve(resolvedAmmoLib)),
}));

vi.mock("@babylonjs/core/Physics/physicsEngineComponent", () => ({}));
vi.mock("@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent", () => ({}));
vi.mock("@babylonjs/core/Meshes/Builders/boxBuilder", () => ({}));
vi.mock("@babylonjs/core/Actions/actionManager", () => ({}));
vi.mock("@babylonjs/core/Culling/ray", () => ({}));
vi.mock("react-resize-detector", () => ({
  default: ({ children }: any) => children,
}));
vi.mock("../../hooks/usePreventTouch", () => ({ default: vi.fn() }));
vi.mock("../banner/ErrorBanner", () => ({
  default: ({ error }: { error?: Error }) => error?.message || null,
}));
vi.mock("../../helpers/shared", () => ({ isSafari: false }));

import DiceInteraction from "./DiceInteraction";
import { AmmoJSPlugin } from "@babylonjs/core/Physics/Plugins/ammoJSPlugin";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";

function renderDiceInteraction(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(<DiceInteraction {...props} />, container);
  });
  return {
    container,
    unmount: () =>
      act(() => {
        ReactDOM.unmountComponentAtNode(container);
      }),
  };
}

describe("DiceInteraction", () => {
  beforeEach(() => {
    disposeEngine.mockClear();
    disposeScene.mockClear();
    runRenderLoop.mockClear();
    resize.mockClear();
    (AmmoJSPlugin as any).mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      })
    );
  });

  async function settleInitialization() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("disposes the Babylon engine when unmounted", async () => {
    const { unmount } = renderDiceInteraction();
    await settleInitialization();

    expect(disposeEngine).not.toHaveBeenCalled();

    unmount();

    expect(disposeEngine).toHaveBeenCalledTimes(1);
  });

  it("does not leak a render loop across repeated mount/unmount cycles", async () => {
    // Mirrors opening and closing the dice tray several times in one session.
    for (let i = 0; i < 3; i++) {
      const { unmount } = renderDiceInteraction();
      await settleInitialization();
      unmount();
    }

    expect(disposeEngine).toHaveBeenCalledTimes(3);
  });

  it("uses a distant camera so dice stay compact over the map", async () => {
    renderDiceInteraction();
    await settleInitialization();

    expect(TargetCamera).toHaveBeenCalledWith(
      "camera",
      expect.objectContaining({ y: 50 }),
      expect.anything()
    );
  });

  it("constructs AmmoJSPlugin with the resolved ammo instance, not the unresolved import", async () => {
    // instantiateAmmo(Ammo, ...) returns the real, ready-to-use physics
    // library. Passing that resolved value into `new AmmoJSPlugin(false, lib)`
    // is required — `new AmmoJSPlugin(false)` falls back to the module-level
    // `Ammo` import, which for the wasm build is just the unresolved factory
    // function, not an initialized instance. Babylon's plugin then loops
    // forever waiting on physics primitives that were never created, which
    // is exactly the "dice tray spinner freezes the window" regression this
    // guards against.
    renderDiceInteraction();

    // Let the instantiateAmmo(...).then(...) microtask run.
    await act(async () => {
      await Promise.resolve();
    });

    expect(AmmoJSPlugin).toHaveBeenCalledTimes(1);
    const [, ammoLibArg] = (AmmoJSPlugin as any).mock.calls[0];
    expect(ammoLibArg).toBe(resolvedAmmoLib);
  });

  it("awaits an async scene mount and reports its rejection in ErrorBanner", async () => {
    const onSceneMount = vi.fn(async () => {
      throw new Error("Falha ao carregar os dados");
    });
    const { container } = renderDiceInteraction({ onSceneMount });

    await settleInitialization();

    expect(onSceneMount).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Falha ao carregar os dados");
    expect(runRenderLoop).not.toHaveBeenCalled();
  });
});
