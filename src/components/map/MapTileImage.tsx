import { Image, ImageProps } from "theme-ui";

import { Map } from "../../types/Map";
import { mapSources as defaultMapSources } from "../../maps";
import { useDataURL } from "../../contexts/AssetsContext";

export interface MapTileImageProps extends ImageProps {
  map: Map;
}

function resolveTileURL(target: Map): string | undefined {
  const isFileBacked = target.type === "file";
  return useDataURL(target, defaultMapSources, undefined, isFileBacked);
}

/** The thumbnail image for a map tile, resolved through the asset cache */
export default function MapTileImage(allProps: MapTileImageProps) {
  const { map: tileMap, ...imageProps } = allProps;
  const tileURL = resolveTileURL(tileMap);
  return <Image src={tileURL} {...imageProps} />;
}
