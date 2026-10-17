import Dexie from "dexie";

import { AccountSession } from "./account";

/**
 * Where the logged in account's session token lives.
 *
 * Deliberately its own tiny Dexie database, separate from ArtisanDB
 * (database.ts): the account session needs to exist before a game is ever
 * opened (AuthGate sits above the router, ArtisanDB is only opened inside
 * the /game/:id route by DatabaseProvider), and it has nothing to do with
 * the 41-version map/token upgrade chain in upgrade.ts. sessionStorage was
 * ruled out on purpose because it dies when the app
 * window closes; IndexedDB survives restarts the same way the rest of the
 * app's data does.
 */
let db: Dexie | undefined;

function getSessionDB(): Dexie {
  if (!db) {
    db = new Dexie("ArtisanAccountDB");
    // Out-of-line keys (no keyPath): the primary key is passed explicitly
    // to put()/get(), so the schema string is just "".
    db.version(1).stores({ session: "" });
  }
  return db;
}

const SESSION_KEY = "current";

export async function loadAccountSession(): Promise<
  AccountSession | undefined
> {
  try {
    const value = await getSessionDB().table("session").get(SESSION_KEY);
    if (
      value?.token &&
      value?.username &&
      value?.displayName &&
      typeof value?.accountId === "number"
    ) {
      return value as AccountSession;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function storeAccountSession(
  session: AccountSession | undefined
): Promise<void> {
  try {
    const table = getSessionDB().table("session");
    if (session) {
      await table.put(session, SESSION_KEY);
    } else {
      await table.delete(SESSION_KEY);
    }
  } catch {
    // Storage disabled or unavailable — the login just won't survive a
    // restart, same fallback behaviour as the rest of the app.
  }
}
