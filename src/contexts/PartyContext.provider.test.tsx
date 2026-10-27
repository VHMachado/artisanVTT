import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import { PartyProvider, useParty } from "./PartyContext";
import type Session from "../network/Session";
import type { PartyState } from "../types/PartyState";

type Listener = (party: PartyState) => void;

/** Just enough of WsClient for PartyProvider: a `party_state` listener
 * registry, plus an `id` that only becomes known after the listener is
 * installed — which is exactly the real order, since the broker's
 * "connected" frame never re-renders this component. */
function fakeSession() {
  const listeners = new Set<Listener>();
  const session = {
    id: undefined as string | undefined,
    socket: {
      on: (event: string, listener: Listener) => {
        if (event === "party_state") listeners.add(listener);
      },
      off: (event: string, listener: Listener) => {
        if (event === "party_state") listeners.delete(listener);
      },
    },
  };
  return {
    session: session as unknown as Session,
    connect(id: string) {
      session.id = id;
    },
    emit(party: PartyState) {
      listeners.forEach((listener) => listener(party));
    },
  };
}

const player = (sessionId: string): PartyState[string] =>
  ({ nickname: sessionId, dice: { share: false, rolls: [] }, sessionId }) as PartyState[string];

let party: PartyState | undefined;
function Reader() {
  party = useParty();
  return null;
}

const containers: HTMLElement[] = [];

afterEach(() => {
  while (containers.length) {
    const container = containers.pop() as HTMLElement;
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
  }
  party = undefined;
});

function mount(session: Session) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  containers.push(container);
  act(() => {
    ReactDOM.render(
      <PartyProvider session={session}>
        <Reader />
      </PartyProvider>,
      container
    );
  });
  return container;
}

describe("PartyProvider", () => {
  /**
   * The broker sends `party_state` exactly once on join and then only
   * when another client's state changes — dropping that first frame left
   * the client believing it was alone for the rest of the session, which
   * is what starved the Espectador window of the map image.
   */
  it("keeps the party published when its own session id arrives late", () => {
    const fake = fakeSession();
    mount(fake.session);

    fake.connect("sess-me");
    act(() => {
      fake.emit({ "sess-me": player("sess-me"), "sess-gm": player("sess-gm") });
    });

    expect(party).toEqual({ "sess-gm": player("sess-gm") });
  });

  it("still excludes the local player from the published party", () => {
    const fake = fakeSession();
    fake.connect("sess-me");
    mount(fake.session);

    act(() => {
      fake.emit({ "sess-me": player("sess-me") });
    });

    expect(party).toEqual({});
  });
});
