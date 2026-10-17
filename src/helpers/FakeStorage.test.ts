import { describe, expect, test } from "vitest";

import FakeStorage from "./FakeStorage";

describe("FakeStorage", () => {
  test("stores, enumerates, removes, and clears in-memory entries", () => {
    const storage = new FakeStorage();

    expect(storage.key(0)).toBeNull();
    expect(storage.getItem("missing")).toBeNull();

    storage.setItem("first", "one");
    storage.setItem("second", "two");
    expect(storage.getItem("first")).toBe("one");
    expect(storage.key(0)).toBe("first");
    expect(storage.key(1)).toBe("second");
    expect(storage.key(2)).toBeNull();

    storage.removeItem("first");
    expect(storage.getItem("first")).toBeNull();
    expect(storage.key(0)).toBe("second");

    storage.clear();
    expect(storage.getItem("second")).toBeNull();
    expect(storage.key(0)).toBeNull();
  });

  test("keeps the fallback store's null behavior for falsy stored values", () => {
    const storage = new FakeStorage();
    storage.setItem("empty", "");
    storage.setItem("zero", 0);
    storage.setItem("false", false);

    expect(storage.getItem("empty")).toBeNull();
    expect(storage.getItem("zero")).toBeNull();
    expect(storage.getItem("false")).toBeNull();
  });
});
