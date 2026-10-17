import React, { createContext, useContext, useEffect, useState } from "react";
import Dexie from "dexie";
import * as Comlink from "comlink";

import ErrorBanner from "../components/banner/ErrorBanner";
import { getDatabase } from "../database";
import type { DatabaseWorkerService } from "../workers/DatabaseWorker";

/**
 * Lifecycle of this browser's Dexie database, exposed so the UI can gate
 * on it: `loading` while the capability probe below is still running,
 * `upgrading` during a slow version bump (UpgradingLoadingOverlay),
 * `disabled` when IndexedDB itself is unavailable (falls back to an
 * in-memory fake-indexeddb, see `probeThenOpen` below), `loaded` once
 * safe to read/write — per CLAUDE.md's "Data lives in the browser".
 */
export type DatabaseStatus = "loading" | "disabled" | "upgrading" | "loaded";

interface DatabaseContextValue {
  database: Dexie | undefined;
  databaseStatus: DatabaseStatus;
  databaseError: Error | undefined;
  worker: Comlink.Remote<DatabaseWorkerService>;
}

const DatabaseContext = createContext<DatabaseContextValue | undefined>(
  undefined
);

// The Worker thread lives for the whole tab, independent of React's mount
// cycle — a module-scoped singleton means every DatabaseProvider mount
// (hot reload, route change) reuses one proxy instead of spawning another.
let workerProxy: Comlink.Remote<DatabaseWorkerService> | undefined;

function databaseWorkerProxy(): Comlink.Remote<DatabaseWorkerService> {
  if (!workerProxy) {
    workerProxy = Comlink.wrap(
      new Worker(new URL("../workers/DatabaseWorker.ts", import.meta.url), {
        type: "module",
      })
    );
  }
  return workerProxy;
}

/** Maps a thrown Dexie error to the pt-BR message ErrorBanner shows.
 * Anything not one of the two known recoverable cases falls through to a
 * generic "reload the page" message. */
function toDisplayError(reason: unknown): Error {
  if (reason instanceof Dexie.DexieError) {
    if (reason.inner?.name === "QuotaExceededError") {
      return {
        name: reason.name,
        message: "Cota de armazenamento excedida — libere espaço e tente novamente.",
      } as Error;
    }
    if (reason.inner?.name === "DatabaseClosedError") {
      return {
        name: reason.name,
        message: "Banco de dados fechado, atualize a página.",
      } as Error;
    }
  }
  return {
    name: reason instanceof Error ? reason.name : undefined,
    message: "Algo deu errado, atualize a página.",
  } as Error;
}

const CAPABILITY_PROBE_DB_NAME = "__test";

/**
 * Opens this browser's Dexie database on mount, tracking its status for
 * every descendant via `useDatabase()`, plus a Comlink worker proxy for
 * bulk work (DatabaseWorker.ts). Tries a throwaway database first
 * (`CAPABILITY_PROBE_DB_NAME`) to detect whether IndexedDB actually works
 * here before touching the real one — some environments (private
 * browsing, a locked-down embed) advertise the API but refuse to use it,
 * which would otherwise surface as a confusing open-time crash instead of
 * the graceful `"disabled"` status this component reports.
 */
export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [database, setDatabase] = useState<Dexie>();
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus>("loading");
  const [databaseError, setDatabaseError] = useState<Error>();

  useEffect(() => {
    const probe = window.indexedDB.open(CAPABILITY_PROBE_DB_NAME);

    probe.onsuccess = async () => {
      probe.result.close();
      const db = getDatabase({ autoOpen: false }, undefined, undefined, true, () => {
        setDatabaseStatus("upgrading");
      });
      setDatabase(db);
      db.on("ready", () => setDatabaseStatus("loaded"));
      db.on("versionchange", () => {
        // A different tab opened a newer schema; reload rather than risk
        // this tab writing against a schema it no longer matches.
        window.location.reload();
      });
      await db.open();
      window.indexedDB.deleteDatabase(CAPABILITY_PROBE_DB_NAME);
    };

    probe.onerror = async () => {
      console.warn("IndexedDB indisponível — nada será persistido nesta sessão");
      const indexedDB = await import("fake-indexeddb");
      const IDBKeyRange = await import("fake-indexeddb/lib/FDBKeyRange");
      const db = getDatabase({ indexedDB, IDBKeyRange, autoOpen: false });
      setDatabase(db);
      db.on("ready", () => setDatabaseStatus("disabled"));
      await db.open();
      window.indexedDB.deleteDatabase(CAPABILITY_PROBE_DB_NAME);
    };

    function reportUnhandledRejection(event: PromiseRejectionEvent) {
      if (!event) {
        return;
      }
      event.preventDefault();
      setDatabaseError(toDisplayError(event.reason));
      console.error(event.reason);
    }
    window.addEventListener("unhandledrejection", reportUnhandledRejection);
    return () =>
      window.removeEventListener("unhandledrejection", reportUnhandledRejection);
  }, []);

  const contextValue: DatabaseContextValue = {
    database,
    databaseStatus,
    databaseError,
    worker: databaseWorkerProxy(),
  };

  return (
    <DatabaseContext.Provider value={contextValue}>
      {children}
      <ErrorBanner
        error={databaseError}
        onRequestClose={() => setDatabaseError(undefined)}
      />
    </DatabaseContext.Provider>
  );
}

export function useDatabase(): DatabaseContextValue {
  const value = useContext(DatabaseContext);
  if (!value) {
    throw new Error("useDatabase must be used within a DatabaseProvider");
  }
  return value;
}

export default DatabaseContext;
