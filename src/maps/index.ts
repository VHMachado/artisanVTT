import { DefaultMap } from "../types/Map";
import { MapState } from "../types/MapState";

/**
 * Artisan ships no sample map images. New libraries start empty and the
 * map picker asks the GM to import their own content.
 */
export const mapSources: Record<string, string> = {};

export function getDefaultMaps(_userId: string): {
  maps: DefaultMap[];
  mapStates: MapState[];
} {
  return { maps: [], mapStates: [] };
}
