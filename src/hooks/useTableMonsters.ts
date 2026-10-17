import { useLiveQuery } from "dexie-react-hooks";

import { getTablesDatabase } from "../helpers/tablesDatabase";
import { TableMonster } from "../types/TableMonster";

/**
 * Live view of a Mesa's homebrew/derived creatures, read from the local
 * mirror — same "UI reads local, sync fills it in" discipline
 * as useTableCharacters/useTable. The network cycle is useTablesSync's job
 * (Game.tsx already runs it for the current Mesa), so this hook only ever
 * touches Dexie and keeps working with the broker down.
 */
export function useTableMonsters(tableId: string | undefined): TableMonster[] {
  const monsters = useLiveQuery<TableMonster[]>(async () => {
    if (!tableId) {
      return [];
    }
    const db = getTablesDatabase();
    const rows = (await db
      .table("monsters")
      .where("tableId")
      .equals(tableId)
      .toArray()) as TableMonster[];
    return rows.filter((m) => !m.deleted);
  }, [tableId]);

  return monsters || [];
}
