import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { AccountSession } from "../helpers/account";
import { getTablesDatabase } from "../helpers/tablesDatabase";
import { runSyncCycle, SyncNotice } from "../helpers/tablesSync";
import { SyncedTable } from "../types/SyncedTable";
import { useBrokerConnectionStatus } from "./useBrokerConnectionStatus";

/**
 * Drives the table sync cycle (see helpers/tablesSync.ts) whenever the app
 * is in a position to reach the broker, and exposes the live local list of
 * Mesas so the UI always reads from Dexie — "a UI lê sempre do local →
 * funciona offline por construção" (offline-first by design).
 */
export function useTablesSync(session: AccountSession | undefined) {
  const status = useBrokerConnectionStatus();
  const [notices, setNotices] = useState<SyncNotice[]>([]);
  const runningRef = useRef(false);

  const sync = useCallback(async () => {
    if (!session || runningRef.current) {
      return;
    }
    runningRef.current = true;
    try {
      const newNotices = await runSyncCycle(session);
      if (newNotices.length > 0) {
        setNotices((prev) => [...prev, ...newNotices]);
      }
    } catch {
      // Best effort: a failed sync attempt just leaves the outbox intact
      // for the next opportunity (offline-first by design).
    } finally {
      runningRef.current = false;
    }
  }, [session]);

  useEffect(() => {
    if (status === "online") {
      sync();
    }
  }, [status, sync]);

  const tablesQuery = useLiveQuery<SyncedTable[]>(
    () => getTablesDatabase().table("tables").toArray(),
    []
  );
  const tables = (tablesQuery || []).filter((t) => !t.deleted);

  const clearNotice = useCallback((index: number) => {
    setNotices((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return { tables, sync, notices, clearNotice, connectionStatus: status };
}
