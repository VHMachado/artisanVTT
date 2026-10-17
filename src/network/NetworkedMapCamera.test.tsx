import { describe, expect, it } from "vitest";
import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom";

import EventEmitter from "../helpers/EventEmitter";

import NetworkedMapCamera from "./NetworkedMapCamera";
import {
  MapInteractionProvider,
  MapInteractionEmitter,
} from "../contexts/MapInteractionContext";
import { MapStageProvider } from "../contexts/MapStageContext";

/** Minimal stand in for the parts of the Konva stage the camera touches */
function fakeStage() {
  const state = { position: { x: 0, y: 0 }, scale: 1 };
  const layer = { position: () => ({ x: 0, y: 0 }) };
  return {
    state,
    stage: {
      position: (p?: { x: number; y: number }) => {
        if (p) {
          state.position = p;
        }
        return state.position;
      },
      scale: (s?: { x: number; y: number }) => {
        if (s) {
          state.scale = s.x;
        }
        return { x: state.scale, y: state.scale };
      },
      scaleX: () => state.scale,
      getLayers: () => [layer],
      draw: () => {},
    },
  };
}

/**
 * Session stub whose socket appears only after connect(), mirroring the real
 * Session which creates it asynchronously inside connect.
 */
class FakeSession extends EventEmitter {
  socket: EventEmitter | undefined;

  connect() {
    this.socket = new EventEmitter();
    // The real Session emits status once it is ready
    this.emit("status", "ready");
  }
}

// React 17 here, so render with react-dom directly rather than
// @testing-library/react, which expects the React 18 client entry point.
function renderCamera(session: any, stageRef: any, following: boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const interaction = {
    stageScale: 1,
    setStageScale: () => {},
    stageWidth: 800,
    stageHeight: 600,
    setPreventMapInteraction: () => {},
    mapWidth: 800,
    mapHeight: 600,
    interactionEmitter: new MapInteractionEmitter(),
  };
  act(() => {
    ReactDOM.render(
      <MapStageProvider value={stageRef}>
        <MapInteractionProvider value={interaction}>
          <NetworkedMapCamera
            session={session}
            broadcasting={false}
            following={following}
          />
        </MapInteractionProvider>
      </MapStageProvider>,
      container
    );
  });

  return {
    unmount: () =>
      act(() => {
        ReactDOM.unmountComponentAtNode(container);
      }),
  };
}

describe("NetworkedMapCamera", () => {
  it("follows a camera that arrives after the socket connects", () => {
    const { stage, state } = fakeStage();
    const stageRef = { current: stage };
    const session = new FakeSession();

    // Mounted before the socket exists, which is the real startup order
    renderCamera(session, stageRef, true);
    expect(session.socket).toBeUndefined();

    act(() => session.connect());

    act(() => {
      session.socket?.emit("player_camera", { x: 0.5, y: 0.5, scale: 2 });
    });

    // Centre of an 800x600 map at scale 2 in an 800x600 window
    expect(state.scale).toBe(2);
    expect(state.position.x).toBeCloseTo(800 / 2 - 0.5 * 800 * 2, 6);
    expect(state.position.y).toBeCloseTo(600 / 2 - 0.5 * 600 * 2, 6);
  });

  it("ignores the shared camera when not following", () => {
    const { stage, state } = fakeStage();
    const session = new FakeSession();
    renderCamera(session, { current: stage }, false);
    act(() => session.connect());

    act(() => {
      session.socket?.emit("player_camera", { x: 0.5, y: 0.5, scale: 3 });
    });

    expect(state.scale).toBe(1);
    expect(state.position).toEqual({ x: 0, y: 0 });
  });

  it("stops listening once unmounted", () => {
    const { stage, state } = fakeStage();
    const session = new FakeSession();
    const { unmount } = renderCamera(session, { current: stage }, true);
    act(() => session.connect());
    unmount();

    act(() => {
      session.socket?.emit("player_camera", { x: 0.5, y: 0.5, scale: 4 });
    });

    expect(state.scale).toBe(1);
  });
});
