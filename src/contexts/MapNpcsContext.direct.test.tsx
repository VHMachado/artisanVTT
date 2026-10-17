import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("./DatabaseContext", () => ({
  useDatabase: () => ({
    database: undefined,
    databaseStatus: "loading",
    worker: {},
  }),
}));
vi.mock("./CurrentMapContext", () => ({
  useCurrentMap: () => ({ currentMapId: undefined }),
}));

import { useMapNpcs } from "./MapNpcsContext";
import { useArtisanStore } from "../state/artisanStore";
import type { MapNpc } from "../types/MapNpc";

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
 * `MapNpcsProvider` is the sole `useLiveQuery` owner (see
 * MapNpcsContext.tsx) — this drives `publishMapNpcs` directly, the same
 * call the provider's effect makes, to prove `useMapNpcs` reads the
 * roster without a context boundary underneath it.
 */
describe("useMapNpcs", () => {
  it("defaults to an empty roster before anything publishes", () => {
    let mapNpcs: MapNpc[] | undefined;
    function Reader() {
      mapNpcs = useMapNpcs().mapNpcs;
      return null;
    }
    const unmount = mount(<Reader />);

    expect(mapNpcs).toEqual([]);
    unmount();
  });

  it("reads whatever roster snapshot was last published", () => {
    const npcs: MapNpc[] = [
      { id: "npc-1", mapId: "cavern", monsterIndex: "goblin", createdAt: 1 },
    ];

    function Publisher() {
      const publishMapNpcs = useArtisanStore((state) => state.publishMapNpcs);
      React.useEffect(() => {
        publishMapNpcs(npcs);
      }, [publishMapNpcs]);
      return null;
    }
    const unmountPublisher = mount(<Publisher />);

    let read: MapNpc[] | undefined;
    function Reader() {
      read = useMapNpcs().mapNpcs;
      return null;
    }
    const unmountReader = mount(<Reader />);

    expect(read).toBe(npcs);
    unmountReader();
    unmountPublisher();
  });
});
