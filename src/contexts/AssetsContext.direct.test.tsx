import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("./DatabaseContext", () => ({
  useDatabase: () => ({
    database: { table: () => ({ get }) },
    databaseStatus: "loaded",
    worker: { cleanAssetCache: vi.fn(), putData: vi.fn() },
  }),
}));

import { useAssets } from "./AssetsContext";

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

describe("useAssets", () => {
  it("reads an asset through the database bridge without an AssetsProvider boundary", async () => {
    const asset = { id: "map", file: new Uint8Array(), mime: "image/png" };
    get.mockResolvedValue(asset);
    let read: ((id: string) => Promise<unknown>) | undefined;

    function Reader() {
      read = useAssets().getAsset;
      return null;
    }

    const unmount = mount(<Reader />);

    await expect(read?.("map")).resolves.toEqual(asset);
    expect(get).toHaveBeenCalledWith("map");
    unmount();
  });
});
