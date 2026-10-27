import FakeStorage from "./FakeStorage";

type SettingsData = Record<string, any>;
type SettingsStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function selectStorage(): SettingsStorage {
  try {
    localStorage.setItem("__test", "__test");
    localStorage.removeItem("__test");
    return localStorage;
  } catch {
    console.warn("Local storage is disabled, no settings will be saved");
    return new FakeStorage();
  }
}

/**
 * Version of the stored blob, or 0 when this device has never stored
 * settings at all. Zero rather than undefined ON PURPOSE: `version()`
 * below compares with `>`, and `1 > undefined` is false (NaN), so a
 * fresh profile would run NO migration and leave `getAll()` returning
 * `null` — which crashes the first component to read `settings.map`
 * (components/map/MapScreen.tsx). Every migration must run on a device
 * with nothing stored; that is exactly the case step 1 exists for.
 */
function readVersion(storage: SettingsStorage, name: string): number {
  const raw = storage.getItem(name);
  const parsed = raw ? JSON.parse(raw) : undefined;
  return parsed?.__version ?? 0;
}

class Settings {
  private readonly storage: SettingsStorage;
  private currentVersion: number;

  constructor(private readonly name: string) {
    this.storage = selectStorage();
    this.currentVersion = readVersion(this.storage, name);
  }

  version(versionNumber: number, upgrade: (settings: SettingsData) => SettingsData) {
    if (versionNumber <= this.currentVersion) return;
    this.currentVersion = versionNumber;
    this.setAll(upgrade(this.getAll()));
  }

  getAll(): any {
    const raw = this.storage.getItem(this.name) as any;
    return JSON.parse(raw);
  }

  get(key: string): any {
    return this.getAll()?.[key];
  }

  setAll(settings: SettingsData): void {
    const payload = { ...settings, __version: this.currentVersion };
    this.storage.setItem(this.name, JSON.stringify(payload));
  }

  set(key: string, value: string): void {
    const settings = this.getAll();
    settings[key] = value;
    this.setAll(settings);
  }
}

export default Settings;
