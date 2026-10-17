import React, {
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { v4 as uuid } from "uuid";

import { useDatabase } from "./DatabaseContext";
import { useCurrentMap } from "./CurrentMapContext";
import { useArtisanStore } from "../state/artisanStore";

import { MapNpc } from "../types/MapNpc";

export type AddMapNpcsEventHandler = (
  mapId: string,
  monsterIndex: string,
  count: number
) => Promise<void>;
export type RemoveMapNpcEventHandler = (id: string) => Promise<void>;

type MapNpcsContextValue = {
  /** Every NPC roster entry for the CURRENTLY loaded map only — see
   * NetworkedMapAndTokens, which passes the current map's id down. Empty
   * (not loading-undefined) until a map is picked, matching the pattern
   * useTokenData/useMapData already use with Dexie's own default. */
  mapNpcs: MapNpc[];
  /** Adds `count` entries for one bestiary entry to a map's roster —
   * AddNpcModal's "+"/quantity control calls this once per creature
   * confirmed, not once per unit (so five goblins is one call with
   * count=5, matching the reference modal's quantity stepper). */
  addMapNpcs: AddMapNpcsEventHandler;
  removeMapNpc: RemoveMapNpcEventHandler;
};

/**
 * Fase "NPCs": per-map roster backing the NPCs tab (components/party/
 * NpcRoster.tsx) — a Mestre-curated shortlist of bestiary entries for the
 * CURRENT map, built through AddNpcModal's right-click "Adicionar NPCs"
 * entry point. Deliberately local-only (own Dexie table, see upgrade.ts
 * v42) — this never syncs through the broker, matching how every other
 * map-scoped record in this app (maps/tokens/states) already lives only
 * on whichever device is running the game (see CLAUDE.md "Data lives in
 * the browser").
 *
 * Reads the current map's id from CurrentMapContext (set by
 * NetworkedMapAndTokens whenever the loaded map changes) rather than
 * taking it as a prop — Party.tsx's NpcRoster and every AddNpcModal it
 * opens are siblings of the map view, several components away from
 * whatever owns `currentMap` state, so a shared source is simpler than
 * threading the id down through Party/NetworkedParty's own props.
 *
 * The roster SNAPSHOT (`mapNpcs`) is published to the
 * `artisanStore` map-npcs slice every render instead of a `createContext`
 * value — this component stays the sole owner of the Dexie `useLiveQuery`
 * and every write operation (`addMapNpcs`/`removeMapNpc`), which keep
 * being read straight off this hook, unchanged.
 */
export function MapNpcsProvider({ children }: { children: React.ReactNode }) {
  const { database } = useDatabase();
  const { currentMapId: mapId } = useCurrentMap();
  const publishMapNpcs = useArtisanStore((state) => state.publishMapNpcs);

  const mapNpcsQuery = useLiveQuery<MapNpc[]>(async () => {
    if (!database || !mapId) {
      return [];
    }
    return database
      .table("mapNpcs")
      .where("mapId")
      .equals(mapId)
      .toArray();
  }, [database, mapId]);

  const mapNpcs = useMemo(() => mapNpcsQuery || [], [mapNpcsQuery]);

  useEffect(() => {
    publishMapNpcs(mapNpcs);
  }, [mapNpcs, publishMapNpcs]);

  return <>{children}</>;
}

export function useMapNpcs(): MapNpcsContextValue {
  const { database } = useDatabase();
  const mapNpcs = useArtisanStore((state) => state.mapNpcs);

  const addMapNpcs = useCallback<AddMapNpcsEventHandler>(
    async (targetMapId, monsterIndex, count) => {
      if (!database || count <= 0) {
        return;
      }
      const now = Date.now();
      const entries: MapNpc[] = Array.from({ length: count }, () => ({
        id: uuid(),
        mapId: targetMapId,
        monsterIndex,
        createdAt: now,
      }));
      await database.table("mapNpcs").bulkAdd(entries);
    },
    [database]
  );

  const removeMapNpc = useCallback<RemoveMapNpcEventHandler>(
    async (id) => {
      await database?.table("mapNpcs").delete(id);
    },
    [database]
  );

  return { mapNpcs, addMapNpcs, removeMapNpc };
}
