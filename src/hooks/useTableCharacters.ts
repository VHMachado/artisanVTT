import { useLiveQuery } from "dexie-react-hooks";

import { getTablesDatabase } from "../helpers/tablesDatabase";
import { Character } from "../types/Character";

/**
 * Live view of a Mesa's Personagens, for the roster
 * (components/party/CharacterRoster.tsx). Backed by the local
 * mirror (helpers/tablesDatabase.ts), same "UI reads local, sync fills it
 * in" discipline as useTablesSync's table list — the actual network sync
 * cycle is useTablesSync's job (Game.tsx runs it via the account session
 * so this hook only ever reads Dexie).
 */
export function useTableCharacters(tableId: string | undefined): Character[] {
  const characters = useLiveQuery<Character[]>(async () => {
    if (!tableId) {
      return [];
    }
    const db = getTablesDatabase();
    const rows = (await db
      .table("characters")
      .where("tableId")
      .equals(tableId)
      .toArray()) as Character[];
    return rows.filter((c) => !c.deleted);
  }, [tableId]);

  return characters || [];
}
