import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it } from "vitest";

import Action from "../actions/Action";
import useMapActions from "./useMapActions";
import type { MapAction } from "./useMapActions";
import type { MapState } from "../types/MapState";

type Unmount = () => void;

function mount(element: React.ReactElement): Unmount {
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

class SetTokenAction extends Action<MapState["tokens"]> {
  constructor(private readonly id: string, private readonly present: boolean) {
    super();
  }
  update(tokens: MapState["tokens"]): MapState["tokens"] {
    const next = { ...tokens };
    if (this.present) {
      next[this.id] = { id: this.id } as any;
    } else {
      delete next[this.id];
    }
    return next;
  }
}

const baseMapState: MapState = {
  tokens: {},
  fogs: {},
  editFlags: [],
  mapId: "cavern",
};

/**
 * `useMapActions` no longer owns the undo/redo history itself (it moved
 * to `artisanStore`'s mesa slice) — this test mounts the hook
 * against a real `setState`-backed `MapState`, the same shape
 * `NetworkedMapAndTokens` hands it, to prove the store-backed adapter
 * still applies/undoes batches onto that state exactly as the old
 * component-local `useState` version did.
 */
describe("useMapActions", () => {
  it("applies an added batch to the map state and undoes/redoes it", () => {
    let mapState: MapState | null = baseMapState;
    let setMapState: React.Dispatch<React.SetStateAction<MapState | null>> =
      () => {};
    let hookResult: ReturnType<typeof useMapActions> | undefined;

    function Harness() {
      const [state, setState] = React.useState<MapState | null>(baseMapState);
      mapState = state;
      setMapState = setState;
      hookResult = useMapActions(setState);
      return null;
    }

    const unmount = mount(<Harness />);

    act(() => {
      const [, addActions] = hookResult!;
      const batch: MapAction[] = [
        { type: "tokens", action: new SetTokenAction("a", true) },
      ];
      addActions(batch);
    });
    expect(mapState?.tokens).toHaveProperty("a");

    act(() => {
      const [, , updateActionIndex] = hookResult!;
      updateActionIndex(-1);
    });
    expect(mapState?.tokens).not.toHaveProperty("a");

    act(() => {
      const [, , updateActionIndex] = hookResult!;
      updateActionIndex(1);
    });
    expect(mapState?.tokens).toHaveProperty("a");

    unmount();
    void setMapState;
  });

  it("resetting clears the history so undo has nothing left to do", () => {
    let mapState: MapState | null = baseMapState;
    let hookResult: ReturnType<typeof useMapActions> | undefined;

    function Harness() {
      const [state, setState] = React.useState<MapState | null>(baseMapState);
      mapState = state;
      hookResult = useMapActions(setState);
      return null;
    }

    const unmount = mount(<Harness />);

    act(() => {
      const [, addActions] = hookResult!;
      addActions([{ type: "tokens", action: new SetTokenAction("a", true) }]);
    });
    act(() => {
      const [, , , resetActions] = hookResult!;
      resetActions();
    });
    expect(hookResult![0]).toEqual({ actions: [], actionIndex: -1 });

    act(() => {
      const [, , updateActionIndex] = hookResult!;
      updateActionIndex(-1);
    });
    // Nothing left to undo: the token stays exactly as the reset left it.
    expect(mapState?.tokens).toHaveProperty("a");

    unmount();
  });
});
