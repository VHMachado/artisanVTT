import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom";
import { describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";

const renderFrame = vi.fn();
const scene = {
  environmentTexture: undefined,
  environmentIntensity: 0,
  render: vi.fn(),
};
const engine = { runRenderLoop: renderFrame };

vi.mock("@babylonjs/core/Maths/math", () => ({
  Vector3: Object.assign(
    vi.fn().mockImplementation((x, y, z) => ({ x, y, z })),
    { Zero: () => ({ x: 0, y: 0 }) }
  ),
}));
vi.mock("@babylonjs/core/Lights/directionalLight", () => ({
  DirectionalLight: vi.fn().mockImplementation(() => ({})),
}));
vi.mock("@babylonjs/core/Lights/Shadows/shadowGenerator", () => ({
  ShadowGenerator: vi.fn().mockImplementation(() => ({
    addShadowCaster: vi.fn(),
    dispose: vi.fn(),
  })),
}));
const { createEnvironment } = vi.hoisted(() => ({
  createEnvironment: vi.fn(() => ({})),
}));
const { disposeDiceMeshes } = vi.hoisted(() => ({
  disposeDiceMeshes: vi.fn(),
}));

vi.mock("@babylonjs/core/Materials/Textures/cubeTexture", () => ({
  CubeTexture: { CreateFromPrefilteredData: createEnvironment },
}));
vi.mock("../../contexts/DiceLoadingContext", () => ({
  useDiceLoading: () => ({ assetLoadStart: vi.fn(), assetLoadFinish: vi.fn() }),
}));
vi.mock("../../hooks/useSetting", () => ({ default: () => ["test"] }));
vi.mock("../../helpers/diceMeshCleanup", () => ({ disposeDiceMeshes }));
vi.mock("../../dice/diceTray/DiceArena", () => ({
  default: class DiceArena {
    static areaFor = vi.fn(() => ({}));
    static rollArea = {};
    constructor() {}
    resize = vi.fn();
    rollArea = {};
    dispose = vi.fn();
  },
}));
vi.mock("../../dice/Dice", () => ({
  default: { roll: vi.fn() },
  physicsInstanceOf: (instance: unknown) => instance,
}));
vi.mock("../../dice", () => ({
  dice: [
    {
      key: "test",
      class: {
        load: vi.fn(() => Promise.resolve()),
        createInstance: vi.fn(() => ({
          physicsImpostor: undefined,
          getChildTransformNodes: () => [],
        })),
      },
    },
  ],
}));
vi.mock("./DiceInteraction", async () => {
  const React = await import("react");
  return {
    default: ({ onSceneMount }: { onSceneMount: Function }) => {
      React.useEffect(() => {
        void onSceneMount({ scene, engine, canvas: { width: 800, height: 600 } });
      }, [onSceneMount]);
      return <canvas />;
    },
  };
});

import DiceRollLayer from "./DiceRollLayer";
import { MapStageProvider } from "../../contexts/MapStageContext";

describe("DiceRollLayer", () => {
  it("clears settled dice when the selector reopens without another roll", async () => {
    vi.useFakeTimers();
    renderFrame.mockClear();
    disposeDiceMeshes.mockClear();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const request = {
      counts: { d20: 1 },
      publishResults: false,
      seed: 1,
    };
    const onRollComplete = vi.fn();

    await act(async () => {
      ReactDOM.render(
        <MapStageProvider value={{ current: null }}>
          <DiceRollLayer
            clearToken={0}
            request={request}
            onDiceRollsChange={vi.fn()}
            onRollDisplay={vi.fn()}
            onRollComplete={onRollComplete}
            onLoadError={vi.fn()}
            forceClearToken={0}
          />
        </MapStageProvider>,
        container
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const frame = renderFrame.mock.calls.at(-1)?.[0];
    expect(frame).toBeTypeOf("function");
    frame(scene);
    vi.advanceTimersByTime(1000);
    frame(scene);
    expect(onRollComplete).toHaveBeenCalledWith(request);

    await act(async () => {
      ReactDOM.render(
        <MapStageProvider value={{ current: null }}>
          <DiceRollLayer
            clearToken={0}
            request={null}
            onDiceRollsChange={vi.fn()}
            onRollDisplay={vi.fn()}
            onRollComplete={onRollComplete}
            onLoadError={vi.fn()}
            forceClearToken={0}
          />
        </MapStageProvider>,
        container
      );
      await Promise.resolve();
    });

    const clearCallsBeforeOpening = disposeDiceMeshes.mock.calls.length;
    await act(async () => {
      ReactDOM.render(
        <MapStageProvider value={{ current: null }}>
          <DiceRollLayer
            clearToken={1}
            request={null}
            onDiceRollsChange={vi.fn()}
            onRollDisplay={vi.fn()}
            onRollComplete={onRollComplete}
            onLoadError={vi.fn()}
            forceClearToken={0}
          />
        </MapStageProvider>,
        container
      );
      await Promise.resolve();
    });

    expect(disposeDiceMeshes).toHaveBeenCalledTimes(clearCallsBeforeOpening + 1);

    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
    vi.useRealTimers();
  });

  it("does not clear a roll that is still active when the dice panel reopens", async () => {
    vi.useFakeTimers();
    renderFrame.mockClear();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const request = {
      counts: { d20: 1 },
      publishResults: false,
      seed: 1,
    };
    const onRollComplete = vi.fn();

    await act(async () => {
      ReactDOM.render(
        <MapStageProvider value={{ current: null }}>
          <DiceRollLayer
            clearToken={0}
            request={request}
            onDiceRollsChange={vi.fn()}
            onRollDisplay={vi.fn()}
            onRollComplete={onRollComplete}
            onLoadError={vi.fn()}
            forceClearToken={0}
          />
        </MapStageProvider>,
        container
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const frame = renderFrame.mock.calls.at(-1)?.[0];
    expect(frame).toBeTypeOf("function");
    frame(scene);

    await act(async () => {
      ReactDOM.render(
        <MapStageProvider value={{ current: null }}>
          <DiceRollLayer
            clearToken={1}
            request={request}
            onDiceRollsChange={vi.fn()}
            onRollDisplay={vi.fn()}
            onRollComplete={onRollComplete}
            onLoadError={vi.fn()}
            forceClearToken={0}
          />
        </MapStageProvider>,
        container
      );
      await Promise.resolve();
    });

    vi.advanceTimersByTime(1000);
    frame(scene);

    expect(onRollComplete).toHaveBeenCalledWith(request);

    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
    vi.useRealTimers();
  });

  it("completes the request that created settled dice before a queued rerender", async () => {
    vi.useFakeTimers();
    renderFrame.mockClear();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const firstRequest = {
      counts: { d20: 1 },
      publishResults: false,
      seed: 1,
    };
    const nextRequest = {
      counts: { d20: 1 },
      publishResults: false,
      seed: 2,
    };
    const onRollComplete = vi.fn();

    await act(async () => {
      ReactDOM.render(
        <MapStageProvider value={{ current: null }}>
          <DiceRollLayer
            clearToken={0}
            request={firstRequest}
            onDiceRollsChange={vi.fn()}
            onRollDisplay={vi.fn()}
            onRollComplete={onRollComplete}
            onLoadError={vi.fn()}
            forceClearToken={0}
          />
        </MapStageProvider>,
        container
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const frame = renderFrame.mock.calls.at(-1)?.[0];
    expect(frame).toBeTypeOf("function");
    frame(scene);
    vi.advanceTimersByTime(1000);

    // React atualiza refs durante o render antes de rodar efeitos passivos.
    // É exatamente a janela em que a fila promove a próxima rolagem.
    ReactDOM.render(
      <MapStageProvider value={{ current: null }}>
        <DiceRollLayer
          clearToken={0}
          request={nextRequest}
          onDiceRollsChange={vi.fn()}
          onRollDisplay={vi.fn()}
          onRollComplete={onRollComplete}
          onLoadError={vi.fn()}
          forceClearToken={0}
        />
      </MapStageProvider>,
      container
    );
    frame(scene);

    expect(onRollComplete).toHaveBeenCalledTimes(1);
    expect(onRollComplete).toHaveBeenCalledWith(firstRequest);

    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
    vi.useRealTimers();
  });

  it("keeps settled dice screen-fixed while the map zoom changes", async () => {
    const position = { x: 320, y: 180 };
    let scale = 1;
    const stageRef = {
      current: {
        position: () => position,
        scaleX: () => scale,
      },
    } as unknown as MutableRefObject<any>;
    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      ReactDOM.render(
        <MapStageProvider value={stageRef}>
          <DiceRollLayer
            clearToken={0}
            request={{ counts: { d20: 1 }, publishResults: false, seed: 1 }}
            onDiceRollsChange={vi.fn()}
            onRollDisplay={vi.fn()}
            onRollComplete={vi.fn()}
            onLoadError={vi.fn()}
            forceClearToken={0}
          />
        </MapStageProvider>,
        container
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    scale = 2;
    const frame = renderFrame.mock.calls.at(-1)?.[0];
    expect(frame).toBeTypeOf("function");
    act(() => frame(scene));

    expect((container.firstElementChild as HTMLElement).style.transform).toBe("");
    expect(createEnvironment).not.toHaveBeenCalled();
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  it("displays a remote (non-publishing) roll without touching player_state", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const onDiceRollsChange = vi.fn();
    const onRollDisplay = vi.fn();

    await act(async () => {
      ReactDOM.render(
        <MapStageProvider value={{ current: null }}>
          <DiceRollLayer
            clearToken={0}
            request={{ counts: { d20: 1 }, publishResults: false, seed: 1 }}
            onDiceRollsChange={onDiceRollsChange}
            onRollDisplay={onRollDisplay}
            onRollComplete={vi.fn()}
            onLoadError={vi.fn()}
            forceClearToken={0}
          />
        </MapStageProvider>,
        container
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Uma rolagem RECEBIDA de outro jogador (publishResults: false) ainda
    // precisa alimentar o cartão de resultado — só não pode tocar
    // player_state.dice, que pertence exclusivamente a quem rolou.
    expect(onRollDisplay).toHaveBeenCalledWith([{ type: "d20", roll: "unknown" }]);
    expect(onDiceRollsChange).not.toHaveBeenCalled();

    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  it("forceClearToken clears an in-flight roll on the FIRST bump and completes it", async () => {
    // Reproduz o bug relatado pelo usuário: clicar "Limpar" enquanto a
    // rolagem ainda está assentando (antes de `update()` marcar todos os
    // dados `asleep`) não disparava `clearDice()` com o `clearToken`
    // soft — exigia um segundo clique depois que a física completasse a
    // rolagem por conta própria. `forceClearToken` precisa limpar E
    // completar a rolagem já no primeiro bump, sem depender de nenhum
    // frame do render loop.
    disposeDiceMeshes.mockClear();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const request = { counts: { d20: 1 }, publishResults: false, seed: 1 };
    const onRollComplete = vi.fn();

    await act(async () => {
      ReactDOM.render(
        <MapStageProvider value={{ current: null }}>
          <DiceRollLayer
            clearToken={0}
            forceClearToken={0}
            request={request}
            onDiceRollsChange={vi.fn()}
            onRollDisplay={vi.fn()}
            onRollComplete={onRollComplete}
            onLoadError={vi.fn()}
          />
        </MapStageProvider>,
        container
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Nenhum frame do render loop rodou ainda — a rolagem está "em voo",
    // nunca marcada `completedRequestRef`/`asleep`. Mesmo assim, UM
    // bump de forceClearToken já precisa limpar e completar.
    const clearCallsBeforeForceClear = disposeDiceMeshes.mock.calls.length;
    await act(async () => {
      ReactDOM.render(
        <MapStageProvider value={{ current: null }}>
          <DiceRollLayer
            clearToken={0}
            forceClearToken={1}
            request={request}
            onDiceRollsChange={vi.fn()}
            onRollDisplay={vi.fn()}
            onRollComplete={onRollComplete}
            onLoadError={vi.fn()}
          />
        </MapStageProvider>,
        container
      );
    });

    expect(disposeDiceMeshes).toHaveBeenCalledTimes(clearCallsBeforeForceClear + 1);
    expect(onRollComplete).toHaveBeenCalledWith(request);

    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });
});
