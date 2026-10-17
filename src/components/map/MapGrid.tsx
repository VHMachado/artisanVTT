import { useEffect, useState } from "react";
import useImage from "use-image";

import { Map } from "../../types/Map";
import Grid from "../konva/Grid";
import { getImageLightness } from "../../helpers/image";
import { mapSources as defaultMapSources } from "../../maps";
import { useDataURL } from "../../contexts/AssetsContext";

function useIsImageLight(mapURL: string | undefined): boolean {
  const [mapImage, mapLoadingStatus] = useImage(mapURL || "");
  const [isLight, setIsLight] = useState(true);

  useEffect(() => {
    if (mapLoadingStatus === "loaded" && mapImage) {
      setIsLight(getImageLightness(mapImage));
    }
  }, [mapImage, mapLoadingStatus]);

  return isLight;
}

/**
 * Renders the grid overlay for a map, picking a light or dark pattern
 * depending on the average lightness of the map image underneath so the
 * lines stay visible against either.
 */
export default function MapGrid({ map }: { map: Map }) {
  const mapURL = useDataURL(map, defaultMapSources, undefined, map.type === "file");
  const isImageLight = useIsImageLight(mapURL);

  return <Grid stroke={isImageLight ? "black" : "white"} />;
}
