import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("./DatabaseContext", () => ({
  useDatabase: () => ({ database: undefined }),
}));

import { useMapData } from "./MapDataContext";
import { useArtisanStore } from "../state/artisanStore";

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

describe("useMapData", () => {
  it("reads the observed library snapshot without a MapDataProvider boundary", () => {
    let mapIds: string[] = [];

    function Seed() {
      const replaceLibrary = useArtisanStore((state) => state.replaceLibrary);
      React.useEffect(() => {
        replaceLibrary({
          maps: [{ id: "cavern" }] as any,
          mapStates: [],
          mapGroups: [],
          mapsLoading: false,
        });
      }, [replaceLibrary]);
      return <Reader />;
    }

    function Reader() {
      mapIds = useMapData().maps.map((map) => map.id);
      return null;
    }

    const unmount = mount(<Seed />);

    expect(mapIds).toEqual(["cavern"]);
    unmount();
  });
});
