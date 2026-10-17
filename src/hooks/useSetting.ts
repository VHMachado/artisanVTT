import lodashGet from "lodash.get";
import lodashSet from "lodash.set";
import { useSettings } from "../contexts/SettingsContext";

/** One leaf of the shared Settings object, read/written via a lodash
 * dot-path (e.g. `"map.gridSnappingSensitivity"`); the backing store is
 * SettingsContext -> ../settings.ts -> localStorage, none of which the
 * caller needs to know about. */
export default function useSetting<T>(dotPath: string): [T, (updated: T) => void] {
  const { settings, setSettings } = useSettings();
  const current = lodashGet(settings, dotPath) as T;
  function setValue(updated: T) {
    setSettings((previous) => {
      const next = { ...previous };
      lodashSet(next, dotPath, updated);
      return next;
    });
  }
  return [current, setValue];
}
