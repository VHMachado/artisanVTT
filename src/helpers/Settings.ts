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

function readVersion(storage: SettingsStorage, name: string): number | undefined {
  const raw = storage.getItem(name);
  const parsed = raw ? JSON.parse(raw) : undefined;
  return parsed?.__version;
}

class Settings {
  private readonly storage: SettingsStorage;
  private currentVersion: number | undefined;

  constructor(private readonly name: string) {
    this.storage = selectStorage();
    this.currentVersion = readVersion(this.storage, name);
  }

  version(versionNumber: number, upgrade: (settings: SettingsData) => SettingsData) {
    const isNewer = versionNumber > (this.currentVersion as any);
    if (!isNewer) return;
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
