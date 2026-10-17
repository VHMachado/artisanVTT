import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import { useAssetURL, useDataURL } from "./AssetsContext";
import { useArtisanStore } from "../state/artisanStore";

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(element, container);
  });
  return {
    container,
    unmount: () => {
      act(() => {
        ReactDOM.unmountComponentAtNode(container);
      });
      container.remove();
    },
  };
}

afterEach(() => {
  const Reset = () => {
    const replaceAssetURLs = useArtisanStore((state) => state.replaceAssetURLs);
    replaceAssetURLs({});
    return null;
  };
  const view = mount(<Reset />);
  view.unmount();
});

describe("useAssetURL", () => {
  it("releases a file cache reference when its consumer unmounts", () => {
    function Reader() {
      const replaceAssetURLs = useArtisanStore((state) => state.replaceAssetURLs);
      React.useEffect(() => {
        replaceAssetURLs({
          map: { id: "map", url: "blob:map", references: 1 },
        });
      }, [replaceAssetURLs]);
      useAssetURL("map", "file", {}, "unknown");
      return null;
    }

    let references: number | undefined;
    function Observer() {
      references = useArtisanStore((state) => state.assetURLs.map?.references);
      return null;
    }

    const view = mount(<Reader />);
    const mountedObserver = mount(<Observer />);
    expect(references).toBe(2);
    mountedObserver.unmount();

    view.unmount();
    const releasedObserver = mount(<Observer />);
    expect(references).toBe(1);
    releasedObserver.unmount();
  });

  it("reads a file URL from the shared library cache without a provider boundary", () => {
    let url: string | undefined;

    function Reader() {
      const replaceAssetURLs = useArtisanStore((state) => state.replaceAssetURLs);
      React.useEffect(() => {
        replaceAssetURLs({
          map: { id: "map", url: "blob:map", references: 1 },
        });
      }, [replaceAssetURLs]);
      url = useAssetURL("map", "file", {}, "unknown");
      return null;
    }

    const view = mount(<Reader />);

    expect(url).toBe("blob:map");
    view.unmount();
  });
});

describe("useDataURL", () => {
  it("prefers a thumbnail over a selected resolution for file data", () => {
    let url: string | undefined;

    function Reader() {
      const replaceAssetURLs = useArtisanStore((state) => state.replaceAssetURLs);
      React.useEffect(() => {
        replaceAssetURLs({
          thumbnail: { id: "thumbnail", url: "blob:thumbnail", references: 1 },
          resolution: { id: "resolution", url: "blob:resolution", references: 1 },
          file: { id: "file", url: "blob:file", references: 1 },
        });
      }, [replaceAssetURLs]);
      url = useDataURL(
        {
          type: "file",
          file: "file",
          thumbnail: "thumbnail",
          quality: "medium",
          resolutions: { medium: "resolution" },
        },
        {},
        "unknown",
        true
      );
      return null;
    }

    const view = mount(<Reader />);

    expect(url).toBe("blob:thumbnail");
    view.unmount();
  });
});
