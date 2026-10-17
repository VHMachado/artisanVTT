/** In-memory stand-in for `localStorage`/`sessionStorage` used when real
 * browser storage has been disabled by the user or environment. */
class FakeStorage {
  private backing: Record<string, unknown> = {};

  key(index: number): string | null {
    const names = Object.keys(this.backing);
    return names[index] ?? null;
  }

  getItem(name: string): any {
    const value = this.backing[name];
    return value || null;
  }

  setItem(name: string, value: unknown): void {
    this.backing[name] = value;
  }

  removeItem(name: string): void {
    delete this.backing[name];
  }

  clear(): void {
    this.backing = {};
  }
}

export default FakeStorage;
