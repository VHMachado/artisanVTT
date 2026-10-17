import { useLiveQuery } from "dexie-react-hooks";

import { getTablesDatabase } from "../helpers/tablesDatabase";
import { SyncedTable } from "../types/SyncedTable";

/**
 * Live view of a single Mesa by id, read from the local mirror
 * (helpers/tablesDatabase.ts) — same "UI reads local" discipline as
 * useTableCharacters/useTablesSync. Used by Game.tsx to tell whether the
 * logged in account is this Mesa's owner (GM), who has
 * full move/edit rights regardless of owning a character.
 */
export function useTable(tableId: string | undefined): SyncedTable | undefined {
  const table = useLiveQuery<SyncedTable | undefined>(async () => {
    if (!tableId) {
      return undefined;
    }
    return (await getTablesDatabase().table("tables").get(tableId)) as
      | SyncedTable
      | undefined;
  }, [tableId]);

  return table;
}
