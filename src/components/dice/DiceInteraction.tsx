import { useEffect, useRef, useState } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { AmmoJSPlugin } from "@babylonjs/core/Physics/Plugins/ammoJSPlugin";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Color4, Matrix, Vector3 } from "@babylonjs/core/Maths/math";
import Ammo from "ammo.js/builds/ammo.wasm.js";
import ammoWasmBinaryUrl from "ammo.js/builds/ammo.wasm.wasm?url";
import ReactResizeDetector from "react-resize-detector";

import "@babylonjs/core/Actions/actionManager";
import "@babylonjs/core/Culling/ray";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import "@babylonjs/core/Physics/physicsEngineComponent";

import { resetDiceCaches } from "../../dice";
import { preloadAmmo } from "../../helpers/ammo";
import { isSafari } from "../../helpers/shared";
import usePreventTouch from "../../hooks/usePreventTouch";
import ErrorBanner from "../banner/ErrorBanner";

const THROW_MULTIPLIER = 2;
const VELOCITY_SAMPLES = 4;

type SceneMountEvent = {
  canvas: HTMLCanvasElement;
  engine: Engine;
  scene: Scene;
};

type SceneMountEventHandler = (event: SceneMountEvent) => void | Promise<void>;

type DiceInteractionProps = {
  onSceneMount?: SceneMountEventHandler;
  onSceneError?: (error: Error) => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  /** Tamanho real do canvas, para a camada de rolagem dimensionar
   * a arena de colisão contra o que a câmera enquadra
   * (`helpers/diceRoll.ts`'s `visibleHalfExtents`). */
  onCanvasResize?: (width: number, height: number) => void;
  /** Quando false (dados sobre a grid), o canvas não intercepta
   * ponteiro — pegar um dado com o mouse roubaria o arrasto de token do
   * mapa por baixo. */
  interactive?: boolean;
};

type LifecycleCallbacks = Pick<
  DiceInteractionProps,
  "onSceneError" | "onSceneMount"
>;

function asError(reason: unknown) {
  return reason instanceof Error ? reason : new Error(String(reason));
}

function destroyRenderer(engine?: Engine, scene?: Scene) {
  scene?.dispose();
  engine?.dispose();
}

function DiceInteraction({
  interactive = true,
  onCanvasResize,
  onPointerDown,
  onPointerUp,
  onSceneError,
  onSceneMount,
}: DiceInteractionProps) {
  const [error, setError] = useState<Error>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine>();
  const sceneRef = useRef<Scene>();
  const selectedMeshRef = useRef<AbstractMesh | null>(null);
  const selectedMassRef = useRef(0);
  const velocitySamplesRef = useRef<Vector3[]>([]);
  const lifecycleCallbacksRef = useRef<LifecycleCallbacks>({
    onSceneError,
    onSceneMount,
  });

  lifecycleCallbacksRef.current = { onSceneError, onSceneMount };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    // Closing the dice tray fast enough disposes the engine/scene while the
    // Ammo instantiation promise is still pending — this flag makes every
    // async step below a no-op once cleanup already ran, instead of
    // mutating a torn-down Scene and leaving its WebGL context hung.
    let active = true;
    let engine: Engine | undefined;
    let scene: Scene | undefined;

    const discard = () => {
      destroyRenderer(engine, scene);
      if (engineRef.current === engine) {
        engineRef.current = undefined;
      }
      if (sceneRef.current === scene) {
        sceneRef.current = undefined;
      }
      engine = undefined;
      scene = undefined;
    };

    const start = async () => {
      try {
        // Ammo creates the WASM runtime first. Babylon only receives a usable
        // physics implementation after this promise resolves — starting the
        // WebGL context before it is ready is what makes Chromium spin
        // forever on this build.
        const ammo = await preloadAmmo(Ammo, ammoWasmBinaryUrl);
        if (!active) {
          return;
        }

        const nextEngine = new Engine(canvas, !isSafari, {
          preserveDrawingBuffer: true,
          stencil: true,
          xrCompatible: false,
        });
        const nextScene = new Scene(nextEngine);
        engine = nextEngine;
        scene = nextScene;

        nextScene.clearColor = new Color4(0, 0, 0, 0);
        nextScene.enablePhysics(
          new Vector3(0, -98, 0),
          new AmmoJSPlugin(false, ammo)
        );

        const camera = new TargetCamera(
          "camera",
          new Vector3(0, 50, 0),
          nextScene
        );
        camera.fov = 0.65;
        camera.setTarget(Vector3.Zero());

        engineRef.current = nextEngine;
        sceneRef.current = nextScene;
        await lifecycleCallbacksRef.current.onSceneMount?.({
          canvas,
          engine: nextEngine,
          scene: nextScene,
        });
        if (!active) {
          return;
        }

        nextEngine.runRenderLoop(() => {
          moveSelectedMesh(sceneRef.current, selectedMeshRef, velocitySamplesRef, camera);
        });
      } catch (reason) {
        discard();
        if (active) {
          const failure = asError(reason);
          setError(failure);
          lifecycleCallbacksRef.current.onSceneError?.(failure);
        }
      }
    };

    void start();

    // The dice tray is lazily mounted (only while open), so every close and
    // reopen mounts/unmounts this component — without this cleanup each
    // cycle leaks another running engine/render loop until enough of them
    // choke the main thread and the window stops responding.
    return () => {
      active = false;
      discard();
      resetDiceCaches();
    };
  }, []);

  const pickUpDie = () => {
    const scene = sceneRef.current;
    if (scene) {
      const hit = scene.pick(scene.pointerX, scene.pointerY);
      const mesh = hit?.hit ? hit.pickedMesh : null;
      if (mesh && mesh.name !== "dice_tray") {
        const impostor = mesh.physicsImpostor;
        impostor?.setLinearVelocity(Vector3.Zero());
        impostor?.setAngularVelocity(Vector3.Zero());
        selectedMassRef.current = impostor?.mass || 0;
        impostor?.setMass(0);
        selectedMeshRef.current = mesh;
      }
    }
    onPointerDown?.();
  };

  const throwDie = () => {
    const mesh = selectedMeshRef.current;
    const scene = sceneRef.current;
    if (mesh && scene) {
      const impostor = mesh.physicsImpostor;
      if (impostor) {
        const velocity = averageVelocity(velocitySamplesRef.current);
        impostor.setMass(selectedMassRef.current);
        impostor.forceUpdate();
        impostor.applyImpulse(
          velocity.scale(THROW_MULTIPLIER * impostor.mass),
          impostor.getObjectCenter()
        );
      }
    }
    selectedMeshRef.current = null;
    selectedMassRef.current = 0;
    velocitySamplesRef.current = [];
    onPointerUp?.();
  };

  const resizeCanvas = (width?: number, height?: number) => {
    if (!width || !height) {
      return;
    }
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (canvas && engine) {
      engine.resize();
      canvas.width = width;
      canvas.height = height;
    }
    onCanvasResize?.(width, height);
  };

  usePreventTouch(containerRef);

  return (
    <div
      ref={containerRef}
      style={{ height: "100%", overflow: "hidden", position: "absolute", width: "100%" }}
    >
      <ReactResizeDetector
        handleHeight
        handleWidth
        onResize={resizeCanvas}
        targetRef={containerRef}
      >
        <canvas
          ref={canvasRef}
          onPointerCancel={interactive ? throwDie : undefined}
          onPointerDown={interactive ? pickUpDie : undefined}
          onPointerLeave={interactive ? throwDie : undefined}
          onPointerUp={interactive ? throwDie : undefined}
          style={{ outline: "none", pointerEvents: interactive ? "auto" : "none" }}
        />
      </ReactResizeDetector>
      <ErrorBanner error={error} onRequestClose={() => setError(undefined)} />
    </div>
  );
}

function moveSelectedMesh(
  scene: Scene | undefined,
  selectedMeshRef: React.MutableRefObject<AbstractMesh | null>,
  velocitySamplesRef: React.MutableRefObject<Vector3[]>,
  camera: TargetCamera
) {
  const mesh = selectedMeshRef.current;
  if (!mesh || !scene) {
    return;
  }

  const ray = scene.createPickingRay(
    scene.pointerX,
    scene.pointerY,
    Matrix.Identity(),
    camera
  );
  const previousPosition = mesh.getAbsolutePosition();
  const nextPosition = ray.origin.scale(camera.globalPosition.y);
  nextPosition.y = previousPosition.y;
  mesh.setAbsolutePosition(nextPosition);

  const samples = velocitySamplesRef.current;
  samples.push(nextPosition.subtract(previousPosition).scale(1000 / scene.deltaTime));
  if (samples.length > VELOCITY_SAMPLES) {
    samples.splice(0, samples.length - VELOCITY_SAMPLES);
  }
}

function averageVelocity(samples: Vector3[]) {
  const velocity = Vector3.Zero();
  for (const sample of samples) {
    velocity.addInPlace(sample);
  }
  return samples.length === 0 ? velocity : velocity.scaleInPlace(1 / samples.length);
}

export default DiceInteraction;
