import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { PlayerState } from "../types/PlayerState";

const harness = vi.hoisted(() => ({
  playerState: {
    nickname: "Aria",
    dice: { share: false, rolls: [] },
    sessionId: "session-1",
    userId: "user-1",
    accountId: undefined,
  } as PlayerState,
  playerUpdater: vi.fn(),
}));

vi.mock("./DatabaseContext", () => ({
  useDatabase: () => ({ database: undefined, databaseStatus: "loading" }),
}));
vi.mock("./UserIdContext", () => ({ useUserId: () => "user-1" }));
vi.mock("./AccountContext", () => ({ useAccount: () => ({ session: undefined }) }));
vi.mock("../hooks/useNetworkedState", () => ({
  default: () => [harness.playerState, harness.playerUpdater],
}));

import { PlayerProvider, usePlayerState } from "./PlayerContext";
import type Session from "../network/Session";
import { useArtisanStore } from "../state/artisanStore";

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const render = (nextElement: React.ReactElement) => {
    act(() => {
      ReactDOM.render(nextElement, container);
    });
  };
  try {
    render(element);
  } catch (error) {
    container.remove();
    throw error;
  }
  return {
    rerender: render,
    unmount: () => {
      act(() => {
        ReactDOM.unmountComponentAtNode(container);
      });
      container.remove();
    },
  };
}

function createSession() {
  return {
    id: "session-1",
    on: vi.fn(),
    off: vi.fn(),
    socket: undefined,
  } as unknown as Session;
}

function renderProvider(session: Session, child: React.ReactNode) {
  return (
    <PlayerProvider session={session}>{child}</PlayerProvider>
  );
}

describe("PlayerProvider", () => {
  it("projects its first snapshot after descendants render", () => {
    let contextSnapshot: PlayerState | undefined;
    const storeSnapshots: Array<PlayerState | undefined> = [];
    function Probe() {
      contextSnapshot = usePlayerState();
      storeSnapshots.push(useArtisanStore((state) => state.playerState));
      return null;
    }

    const { unmount } = mount(renderProvider(createSession(), <Probe />));

    expect(contextSnapshot).toBe(harness.playerState);
    expect(storeSnapshots).toEqual([undefined, harness.playerState]);
    unmount();
  });

  it("does not expose its context snapshot outside the provider", () => {
    function Reader() {
      usePlayerState();
      return null;
    }

    const { unmount: unmountProvider } = mount(
      renderProvider(createSession(), null)
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => mount(<Reader />)).toThrow(
        "usePlayerState must be used within a PlayerProvider"
      );
    } finally {
      consoleError.mockRestore();
      unmountProvider();
    }
  });

  it("projects an update after descendants render without a render-phase warning", () => {
    let contextSnapshot: PlayerState | undefined;
    const storeSnapshots: Array<PlayerState | undefined> = [];
    function Probe() {
      contextSnapshot = usePlayerState();
      storeSnapshots.push(useArtisanStore((state) => state.playerState));
      return null;
    }

    const session = createSession();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const initialState = harness.playerState;
    const { rerender, unmount } = mount(renderProvider(session, <Probe />));
    const nextState: PlayerState = { ...initialState, nickname: "Bryn" };

    try {
      harness.playerState = nextState;
      const storeSnapshotsBeforeUpdate = storeSnapshots.length;
      rerender(renderProvider(session, <Probe />));

      expect(contextSnapshot).toBe(nextState);
      expect(storeSnapshots.slice(storeSnapshotsBeforeUpdate)).toEqual([
        initialState,
        nextState,
      ]);
      expect(consoleError).not.toHaveBeenCalledWith(
        expect.stringContaining("Cannot update a component")
      );
    } finally {
      harness.playerState = initialState;
      consoleError.mockRestore();
      unmount();
    }
  });
});
