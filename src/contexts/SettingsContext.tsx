import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getSettings } from "../settings";
import { Settings } from "../types/Settings";

type SetSettingsFn = React.Dispatch<React.SetStateAction<Settings>>;
interface SettingsContextValue { settings: Settings; setSettings: SetSettingsFn }

const Context = createContext<SettingsContextValue | null>(null);
// One instance per page load; a provider remount (fast refresh, route
// change) must not replay the localStorage migration chain in ../settings
// a second time, so this lives at module scope rather than inside state.
const store = getSettings();

interface ProviderProps { children: React.ReactNode }

export function SettingsProvider({ children }: ProviderProps) {
  const [settings, setSettings] = useState<Settings>(() => store.getAll());
  useEffect(() => { store.setAll(settings); }, [settings]);
  const value = useMemo(() => ({ settings, setSettings }), [settings]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * Access point for the live Settings object plus its setter. Prefer
 * `useSetting` (hooks/useSetting.ts) when only one leaf matters — this
 * hook hands out the whole shape (types/Settings.ts).
 */
export function useSettings(): SettingsContextValue {
  const found = useContext(Context);
  if (found === null) throw new Error("useSettings must be used within a SettingsProvider");
  return found;
}

export default Context;
