import React, { useCallback, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Dexie from "dexie";

import { useDatabase } from "./DatabaseContext";
import { useArtisanStore } from "../state/artisanStore";

import { Map } from "../types/Map";
import { MapState } from "../types/MapState";
import { Group } from "../types/Group";
import { removeGroupsItems } from "../helpers/group";

type MapGroupsRecord = { items: Group[] };

export type MapData = {
  maps: Map[];
  mapStates: MapState[];
  mapGroups: Group[];
  mapsById: Record<string, Map>;
  mapsLoading: boolean;
  addMap: (map: Map) => Promise<void>;
  removeMaps: (ids: string[]) => Promise<void>;
  resetMap: (id: string) => Promise<MapState>;
  updateMap: (id: string, update: Partial<Map>) => Promise<void>;
  updateMapState: (id: string, update: Partial<MapState>) => Promise<void>;
  getMapState: (id: string) => Promise<MapState | undefined>;
  getMap: (id: string) => Promise<Map | undefined>;
  updateMapGroups: (groups: Group[]) => Promise<void>;
};

const defaultMapState: Omit<MapState, "mapId"> = {
  tokens: {},
  fogs: {},
  editFlags: ["tokens"],
};

/** The three Dexie tables that together make up the map library, read as
 * one `useEffect`'s worth of live queries so `MapDataProvider` doesn't
 * repeat the same `useLiveQuery(() => database?.table(...), [database])`
 * shape three times with only the table name and query differing. */
function useLibraryTables(database: Dexie | undefined) {
  const maps = useLiveQuery<Map[]>(
    () => database?.table("maps").toArray() || [],
    [database]
  );
  const mapStates = useLiveQuery<MapState[]>(
    () => database?.table("states").toArray() || [],
    [database]
  );
  const mapGroupRecord = useLiveQuery<MapGroupsRecord | undefined>(
    () => database?.table("groups").get("maps"),
    [database]
  );

  return {
    maps: maps || [],
    mapStates: mapStates || [],
    mapGroups: mapGroupRecord?.items || [],
    mapsLoading: !maps || !mapStates,
  };
}

/**
 * Bridges Dexie's observed map library into the shared library slice. Database
 * reads and writes remain here; the store carries only the current snapshot.
 */
export function MapDataProvider({ children }: { children: React.ReactNode }) {
  const { database } = useDatabase();
  const replaceLibrary = useArtisanStore((state) => state.replaceLibrary);
  const library = useLibraryTables(database);

  useEffect(() => {
    replaceLibrary(library);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replaceLibrary, library]);

  return <>{children}</>;
}

/** Looks up the `id` of whatever map a drag/removal just touched among
 * `file`-type maps' asset ids (file, thumbnail, every resolution) — the
 * set `removeMaps` needs to also delete from the `assets` table. */
function collectRemovedAssetIds(removedMaps: (Map | undefined)[]): string[] {
  const assetIds: string[] = [];
  for (const map of removedMaps) {
    if (map?.type !== "file") {
      continue;
    }
    assetIds.push(map.file, map.thumbnail);
    for (const resolution of Object.values(map.resolutions) as Array<
      string | undefined
    >) {
      if (resolution) {
        assetIds.push(resolution);
      }
    }
  }
  return assetIds;
}

/**
 * Reads the shared library snapshot and exposes persistence operations through
 * the local Dexie bridge. Consumers no longer depend on a React context.
 */
export function useMapData(): MapData {
  const { database } = useDatabase();
  const maps = useArtisanStore((state) => state.maps);
  const mapStates = useArtisanStore((state) => state.mapStates);
  const mapGroups = useArtisanStore((state) => state.mapGroups);
  const mapsById = useArtisanStore((state) => state.mapsById);
  const mapsLoading = useArtisanStore((state) => state.mapsLoading);
  const replaceLibrary = useArtisanStore((state) => state.replaceLibrary);

  const getMap = useCallback(
    (mapId: string) => database?.table("maps").get(mapId) as Promise<Map | undefined>,
    [database]
  );
  const getMapState = useCallback(
    (mapId: string) =>
      database?.table("states").get(mapId) as Promise<MapState | undefined>,
    [database]
  );
  const updateMap = useCallback(
    async (id: string, update: Partial<Map>) => {
      await database?.table("maps").update(id, update);
    },
    [database]
  );
  const updateMapState = useCallback(
    async (id: string, update: Partial<MapState>) => {
      await database?.table("states").update(id, update);
    },
    [database]
  );

  const addMap = useCallback(
    async (map: Map) => {
      if (!database) {
        return;
      }
      await database.table("maps").add(map);
      await database.table("states").add({ ...defaultMapState, mapId: map.id });
      const group = await database.table("groups").get("maps");
      await database.table("groups").update("maps", {
        items: [{ id: map.id, type: "item" }, ...group.items],
      });
    },
    [database]
  );

  const removeMaps = useCallback(
    async (ids: string[]) => {
      if (!database) {
        return;
      }
      const removedMaps = await database.table("maps").bulkGet(ids);
      const assetIds = collectRemovedAssetIds(removedMaps);

      const group = await database.table("groups").get("maps");
      await database.table("groups").update("maps", {
        items: removeGroupsItems(group.items, ids),
      });
      await database.table("maps").bulkDelete(ids);
      await database.table("states").bulkDelete(ids);
      await database.table("assets").bulkDelete(assetIds);
    },
    [database]
  );

  const resetMap = useCallback(
    async (id: string) => {
      const state: MapState = { ...defaultMapState, mapId: id };
      await database?.table("states").put(state);
      return state;
    },
    [database]
  );

  const updateMapGroups = useCallback(
    async (groups: Group[]) => {
      replaceLibrary({ maps, mapStates, mapGroups: groups, mapsLoading });
      await database?.table("groups").update("maps", { items: groups });
    },
    [database, mapStates, maps, mapsLoading, replaceLibrary]
  );

  return {
    maps,
    mapStates,
    mapGroups,
    mapsById,
    mapsLoading,
    addMap,
    removeMaps,
    resetMap,
    updateMap,
    updateMapState,
    getMap,
    getMapState,
    updateMapGroups,
  };
}
