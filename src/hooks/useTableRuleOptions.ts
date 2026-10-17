import { useLiveQuery } from "dexie-react-hooks";

import { getTablesDatabase } from "../helpers/tablesDatabase";
import { TableRuleOption } from "../types/HomebrewOption";

/**
 * Live view of a Mesa's homebrew subraces and subclasses, minus
 * tombstones — the same shape and discipline as useTableMonsters.
 *
 * Returns [] while Dexie resolves so callers can render an empty list
 * without a loading branch.
 */
export function useTableRuleOptions(tableId: string): TableRuleOption[] {
  return (
    useLiveQuery(
      async () => {
        const rows = (await getTablesDatabase()
          .table("ruleOptions")
          .where("tableId")
          .equals(tableId)
          .toArray()) as TableRuleOption[];
        return rows
          .filter((option) => !option.deleted)
          .sort((a, b) => a.name.localeCompare(b.name));
      },
      [tableId],
      [] as TableRuleOption[]
    ) ?? []
  );
}
