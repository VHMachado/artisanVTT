import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it } from "vitest";

import { useParty } from "./PartyContext";
import { useArtisanStore } from "../state/artisanStore";
import type { PartyState } from "../types/PartyState";

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(element, container);
  });
  return () => {
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
  };
}

/**
 * `PartyProvider` is a thin socket listener (see PartyContext.tsx) — this
 * test drives the store's `publishPartyState` directly, the same call the
 * provider's socket handler makes, to prove `useParty` reads it without a
 * context boundary underneath.
 */
describe("useParty", () => {
  it("defaults to an empty party before anything publishes", () => {
    let party: PartyState | undefined;
    function Reader() {
      party = useParty();
      return null;
    }
    const unmount = mount(<Reader />);

    expect(party).toEqual({});
    unmount();
  });

  it("reads whatever party snapshot was last published", () => {
    const party: PartyState = {
      "sess-2": {
        nickname: "Bram",
        dice: { share: false, rolls: [] },
        sessionId: "sess-2",
      },
    };

    function Publisher() {
      const publishPartyState = useArtisanStore(
        (state) => state.publishPartyState
      );
      React.useEffect(() => {
        publishPartyState(party);
      }, [publishPartyState]);
      return null;
    }
    const unmountPublisher = mount(<Publisher />);

    let read: PartyState | undefined;
    function Reader() {
      read = useParty();
      return null;
    }
    const unmountReader = mount(<Reader />);

    expect(read).toBe(party);
    unmountReader();
    unmountPublisher();
  });
});
