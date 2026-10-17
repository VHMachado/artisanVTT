import { describe, expect, test, vi } from "vitest";
import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom";

vi.mock("../../contexts/AssetsContext", () => ({
  useDataURL: () => "map://fixture",
}));

vi.mock("../../helpers/grid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../helpers/grid")>();
  return {
    ...actual,
    getGridDetectionFromImage: vi.fn(() => ({
      source: "floorTiles",
      pitch: 24,
      phase: { x: 12, y: 6 },
      size: { x: 76, y: 42 },
      score: 0.8,
    })),
  };
});

vi.mock("../Select", () => ({
  default: () => <select />,
}));

import MapSettings from "./MapSettings";

vi.stubGlobal(
  "fetch",
  vi.fn(() => Promise.resolve({ blob: () => Promise.resolve(new Blob(["map"])) }))
);

const map = {
  id: "map-id",
  name: "Foundry",
  owner: "owner-id",
  type: "file" as const,
  file: "asset-id",
  resolutions: {},
  thumbnail: "thumb-id",
  quality: "original" as const,
  width: 1824,
  height: 1008,
  lastModified: 0,
  created: 0,
  showGrid: true,
  snapToGrid: true,
  grid: {
    type: "hexVertical" as const,
    size: { x: 22, y: 22 },
    inset: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 1, y: 1 } },
    measurement: { type: "manhattan" as const, scale: "5ft" },
  },
};

const mapState = { mapId: map.id, tokens: {}, fogs: {}, editFlags: [] } as any;

describe("MapSettings floor-grid detection", () => {
  test("stages a detected square grid without persisting it", () => {
    const onSettingsChange = vi.fn();
    const container = document.createElement("div");
    const previousImage = global.Image;
    class ImmediateImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        this.onload?.();
      }
    }
    global.Image = ImmediateImage as any;

    act(() => {
      ReactDOM.render(
        <MapSettings
          map={map}
          mapState={mapState}
          onSettingsChange={onSettingsChange}
          onStateSettingsChange={vi.fn()}
        />,
        container
      );
    });
    const button = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Detect floor grid"
    ) as HTMLButtonElement;

    act(() => button.click());

    expect(onSettingsChange).toHaveBeenCalledWith({
      grid: expect.objectContaining({
        type: "square",
        size: { x: 76, y: 42 },
        inset: {
          topLeft: { x: 12 / 1824, y: 6 / 1008 },
          bottomRight: { x: 1836 / 1824, y: 1014 / 1008 },
        },
        measurement: { type: "chebyshev", scale: "5ft" },
      }),
    });
    expect(container.textContent).toContain("Detected 76 columns × 42 rows.");

    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    global.Image = previousImage;
  });

  test("ignores an image result after the settings form unmounts", () => {
    const onSettingsChange = vi.fn();
    const container = document.createElement("div");
    const previousImage = global.Image;
    let image: { onload: (() => void) | null } | undefined;
    class DeferredImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        image = this;
      }
      set src(_value: string) {}
    }
    global.Image = DeferredImage as any;

    act(() => {
      ReactDOM.render(
        <MapSettings
          map={map}
          mapState={mapState}
          onSettingsChange={onSettingsChange}
          onStateSettingsChange={vi.fn()}
        />,
        container
      );
    });
    const button = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Detect floor grid"
    ) as HTMLButtonElement;
    act(() => button.click());
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    act(() => image?.onload?.());

    expect(onSettingsChange).not.toHaveBeenCalled();
    global.Image = previousImage;
  });

  test("preserves newer staged grid settings while detection is loading", () => {
    const onSettingsChange = vi.fn();
    const container = document.createElement("div");
    const previousImage = global.Image;
    let image: { onload: (() => void) | null } | undefined;
    class DeferredImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        image = this;
      }
      set src(_value: string) {}
    }
    global.Image = DeferredImage as any;

    const render = (currentMap = map) => {
      ReactDOM.render(
        <MapSettings
          map={currentMap}
          mapState={mapState}
          onSettingsChange={onSettingsChange}
          onStateSettingsChange={vi.fn()}
        />,
        container
      );
    };
    act(() => render());
    const button = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Detect floor grid"
    ) as HTMLButtonElement;
    act(() => button.click());

    const editedMap = {
      ...map,
      grid: { ...map.grid, measurement: { ...map.grid.measurement, scale: "10ft" } },
    };
    act(() => render(editedMap));
    act(() => image?.onload?.());

    expect(onSettingsChange).toHaveBeenLastCalledWith({
      grid: expect.objectContaining({
        size: { x: 76, y: 42 },
        measurement: { type: "chebyshev", scale: "10ft" },
      }),
    });
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    global.Image = previousImage;
  });
});
