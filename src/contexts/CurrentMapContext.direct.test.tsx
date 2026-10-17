import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it } from "vitest";

import { useCurrentMap } from "./CurrentMapContext";

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

describe("useCurrentMap", () => {
  it("reads and updates the mesa's current-map projection without a provider boundary", () => {
    let snapshot: ReturnType<typeof useCurrentMap> | undefined;

    function Reader() {
      const currentMap = useCurrentMap();
      const { setCurrentMap, setPlacedTokenEntities } = currentMap;
      React.useEffect(() => {
        setCurrentMap("cavern", true);
        setPlacedTokenEntities(
          new Set(["char-1"]),
          new Set(["npc-1", "npc-2"])
        );
        // Runs once: `setCurrentMap`/`setPlacedTokenEntities` are store
        // actions (stable identity), but `currentMap` itself is a fresh
        // object every render — depending on it here would re-fire this
        // effect forever since the sets it writes are also new instances.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      snapshot = currentMap;
      return null;
    }

    const unmount = mount(<Reader />);

    expect(snapshot?.currentMapId).toBe("cavern");
    expect(snapshot?.isCurrentMapOwner).toBe(true);
    expect(snapshot?.placedCharacterIds).toEqual(new Set(["char-1"]));
    expect(snapshot?.placedNpcIds).toEqual(new Set(["npc-1", "npc-2"]));

    unmount();
  });
});
