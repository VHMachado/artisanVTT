import { describe, expect, it } from "vitest";
import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom";

import EventEmitter from "../helpers/EventEmitter";
import useNetworkedState, { SetNetworkedState } from "./useNetworkedState";
import type Session from "../network/Session";

/**
 * ("Estado autoritativo com versão") added an
 * opt-in `versioned` flag to useNetworkedState: partial updates now carry a
 * `baseVersion` and the hook tracks the server-issued version echoed back
 * on full syncs (`{state, version}`), update broadcasts (`update.version`)
 * and a dedicated `${eventName}_version` ack — see broker-go/internal/game/
 * hub.go's wrapVersionedState/handleVersionedUpdate for the server half.
 *
 * These tests drive the hook the same way NetworkedMapCamera.test.tsx
 * drives a real component: a fake EventEmitter stands in for the socket
 * (Session.ts only ever touches emit/on/off on it), rendered with React 17
 * via react-dom directly since @testing-library/react here targets React 18.
 */

type FakeSocket = EventEmitter & { emit: (event: string, ...args: any[]) => boolean };

function fakeSession(): { session: Session; socket: FakeSocket; emitted: [string, any][] } {
  const emitted: [string, any][] = [];
  const socket = new EventEmitter() as FakeSocket;
  // Override emit so the harness can record outgoing frames instead of
  // sending them anywhere — Session.ts only ever calls socket.emit to send,
  // never to dispatch locally (that's what the base EventEmitter.emit,
  // exposed below as `deliver`, is for — same split WsClient's real emit
  // has between outgoing-to-the-wire and incoming-from-the-wire).
  socket.emit = ((event: string, ...args: any[]) => {
    emitted.push([event, args[0]]);
    return true;
  }) as any;
  const deliver = (event: string, payload: any) => {
    EventEmitter.prototype.emit.call(socket, event, payload);
  };
  (socket as any)._deliver = deliver;

  const session = { socket } as unknown as Session;
  return { session, socket, emitted };
}

function deliver(socket: FakeSocket, event: string, payload: any) {
  (socket as any)._deliver(event, payload);
}

type Harness<S> = {
  getState: () => S;
  setState: SetNetworkedState<S>;
  unmount: () => void;
};

function renderHook<S extends { readonly [x: string]: any } | null>(
  initialState: S,
  session: Session,
  eventName: string,
  versioned: boolean
): Harness<S> {
  const container = document.createElement("div");
  document.body.appendChild(container);

  let latestState: S = initialState;
  let latestSetState: SetNetworkedState<S> = () => {};

  function TestComponent() {
    const [state, setState] = useNetworkedState<S>(
      initialState,
      session,
      eventName,
      0, // no debounce, so effects run on the next flush
      true,
      "mapId",
      versioned
    );
    latestState = state;
    latestSetState = setState;
    return null;
  }

  act(() => {
    ReactDOM.render(<TestComponent />, container);
  });

  return {
    getState: () => latestState,
    setState: (...args) => act(() => latestSetState(...args)),
    unmount: () =>
      act(() => {
        ReactDOM.unmountComponentAtNode(container);
      }),
  };
}

async function flushDebounce() {
  // debounceRate is 0 but useDebounce still goes through a setTimeout(0);
  // let real timers run one macrotask.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe("useNetworkedState versioned mode", () => {
  it("adopts {state, version} from a full sync", async () => {
    const { session, socket } = fakeSession();
    const harness = renderHook<any>(null, session, "map_state", true);

    deliver(socket, "map_state", { state: { mapId: "m1", x: 1 }, version: 5 });
    expect(harness.getState()).toEqual({ mapId: "m1", x: 1 });

    harness.unmount();
  });

  it("stamps outgoing partial updates with the last known baseVersion", async () => {
    const { session, socket, emitted } = fakeSession();
    const harness = renderHook<any>(null, session, "map_state", true);

    deliver(socket, "map_state", { state: { mapId: "m1", x: 1 }, version: 3 });
    emitted.length = 0;

    harness.setState({ mapId: "m1", x: 2 });
    await flushDebounce();

    const updateFrame = emitted.find(([event]) => event === "map_state_update");
    expect(updateFrame).toBeDefined();
    expect(updateFrame![1].baseVersion).toBe(3);

    harness.unmount();
  });

  it("adopts the version echoed by a broadcast partial update", async () => {
    const { session, socket } = fakeSession();
    const harness = renderHook<any>(null, session, "map_state", true);

    deliver(socket, "map_state", { state: { mapId: "m1", x: 1 }, version: 1 });
    deliver(socket, "map_state_update", {
      id: "m1",
      version: 2,
      changes: [{ kind: "E", path: ["x"], rhs: 42 }],
    });

    expect(harness.getState()).toEqual({ mapId: "m1", x: 42 });

    harness.unmount();
  });

  it("adopts the version from a dedicated ack event after its own update is accepted", async () => {
    const { session, socket, emitted } = fakeSession();
    const harness = renderHook<any>(null, session, "map_state", true);

    deliver(socket, "map_state", { state: { mapId: "m1", x: 1 }, version: 1 });
    emitted.length = 0;

    harness.setState({ mapId: "m1", x: 2 });
    await flushDebounce();
    expect(emitted[0][1].baseVersion).toBe(1);

    // Server acks with the resulting version.
    deliver(socket, "map_state_version", 2);

    emitted.length = 0;
    harness.setState({ mapId: "m1", x: 3 });
    await flushDebounce();

    const secondUpdate = emitted.find(([event]) => event === "map_state_update");
    expect(secondUpdate![1].baseVersion).toBe(2);

    harness.unmount();
  });

  it("adopts a rejected update's canonical resync instead of the stale local edit", async () => {
    const { session, socket } = fakeSession();
    const harness = renderHook<any>(null, session, "map_state", true);

    deliver(socket, "map_state", { state: { mapId: "m1", x: 1 }, version: 1 });

    // Server rejects a stale update by resending the canonical full state,
    // exactly like handleVersionedUpdate's Conflict branch on broker-go.
    deliver(socket, "map_state", { state: { mapId: "m1", x: 10 }, version: 2 });

    expect(harness.getState()).toEqual({ mapId: "m1", x: 10 });

    harness.unmount();
  });

  it("does not touch baseVersion tracking when versioned is false (legacy behaviour)", async () => {
    const { session, socket, emitted } = fakeSession();
    const harness = renderHook<any>(null, session, "map_state", false);

    deliver(socket, "map_state", { mapId: "m1", x: 1 });
    emitted.length = 0;

    harness.setState({ mapId: "m1", x: 2 });
    await flushDebounce();

    const updateFrame = emitted.find(([event]) => event === "map_state_update");
    expect(updateFrame).toBeDefined();
    expect(updateFrame![1].baseVersion).toBeUndefined();

    harness.unmount();
  });
});
