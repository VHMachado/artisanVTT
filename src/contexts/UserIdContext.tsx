import React, { useEffect } from "react";
import type Dexie from "dexie";
import { useDatabase } from "./DatabaseContext";
import { useArtisanStore } from "../state/artisanStore";

/** Reads the one persisted identity row, `undefined` on a fresh profile. */
async function readPersistedUserId(db: Dexie): Promise<string | undefined> {
  return (await db.table("user").get("userId"))?.value;
}

/** Projects the persisted identity row onto the shared store; Dexie stays
 * the source of truth and every consumer subscribes only to the id. */
export function UserIdProvider({ children }: { children: React.ReactNode }) {
  const setUserId = useArtisanStore((state) => state.setUserId);
  const { database, databaseStatus } = useDatabase();

  useEffect(() => {
    let cancelled = false;
    if (!database || databaseStatus === "loading") {
      setUserId(undefined);
      return undefined;
    }
    readPersistedUserId(database).then((id) => {
      if (!cancelled) setUserId(id);
    });
    return () => { cancelled = true; };
  }, [database, databaseStatus, setUserId]);

  return <>{children}</>;
}

export function useUserId() {
  return useArtisanStore((state) => state.userId);
}
