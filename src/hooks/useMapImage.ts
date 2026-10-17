import { useEffect, useState } from "react";
import useImage from "use-image";

import { Map } from "../types/Map";
import { mapSources as defaultMapSources } from "../maps";
import { useDataURL } from "../contexts/AssetsContext";

type ImageLoadStatus = "loaded" | "loading" | "failed";
type ImageLoadResult = [HTMLImageElement | undefined, ImageLoadStatus];

/**
 * A legacy "default" (built-in) map that shipped with the original app no
 * longer has a bundled image to render; treat it as a valid, blank map
 * instead of stuck "loading" forever.
 */
export function canRenderBlankDefaultMap(
  map: Map | null,
  mapURL: string | undefined
): boolean {
  return map?.type === "default" && !mapURL;
}

/** Holds the last fully-decoded image, swapping only once `useImage`
 * reports "loaded" so the canvas never flashes blank mid-decode; forced
 * back to `undefined` while `clear` is true (the blank-default case). */
function useStableDecodedImage(
  rawImage: HTMLImageElement | undefined,
  rawStatus: ImageLoadStatus,
  clear: boolean
): HTMLImageElement | undefined {
  const [stable, setStable] = useState<HTMLImageElement>();
  useEffect(() => {
    if (clear) {
      setStable(undefined);
    } else if (rawStatus === "loaded" && rawImage) {
      setStable(rawImage);
    }
  }, [clear, rawImage, rawStatus]);
  return stable;
}

function useMapImage(map: Map | null): ImageLoadResult {
  const mapURL = useDataURL(map, defaultMapSources);
  const isBlankDefault = canRenderBlankDefaultMap(map, mapURL);
  const [rawImage, rawStatus] = useImage(mapURL || "");
  const stableImage = useStableDecodedImage(rawImage, rawStatus, isBlankDefault);

  return isBlankDefault ? [undefined, "loaded"] : [stableImage, rawStatus];
}

export default useMapImage;
