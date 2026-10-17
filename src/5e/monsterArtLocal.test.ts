import { describe, expect, it, afterEach } from "vitest";

import {
  loadLocalMonsterArtOverrides,
  localPortraitFile,
  localTokenArtVariants,
  getLocalMonsterArtRoot,
  pickLocalMonsterArtRoot,
  pickImportSourceDirectory,
  importLocalMonsterArtPack,
} from "./monsterArtLocal";

/** The module keeps its override in a private module-level variable, so
 * each test must explicitly reset it back to empty afterwards rather
 * than relying on module re-evaluation between cases (Vitest does not
 * re-import a module per test by default). */
afterEach(async () => {
  delete (window as any).go;
  await loadLocalMonsterArtOverrides();
});

describe("monsterArtLocal", () => {
  it("stays empty with no window.go binding (web build)", async () => {
    delete (window as any).go;

    await loadLocalMonsterArtOverrides();

    expect(localTokenArtVariants("goblin")).toBeUndefined();
    expect(localPortraitFile("goblin")).toBeUndefined();
  });

  it("applies a valid scan result from the Go binding", async () => {
    (window as any).go = {
      main: {
        App: {
          ScanLocalMonsterArt: async () =>
            JSON.stringify({
              tokenArt: {
                goblin: [
                  { file: "goblin_1.png", width: 512, height: 512 },
                  { file: "goblin_2.png", width: 480, height: 512 },
                ],
              },
              portraits: { goblin: "goblin.jpg" },
            }),
        },
      },
    };

    await loadLocalMonsterArtOverrides();

    expect(localTokenArtVariants("goblin")).toEqual([
      { file: "goblin_1.png", width: 512, height: 512 },
      { file: "goblin_2.png", width: 480, height: 512 },
    ]);
    expect(localPortraitFile("goblin")).toBe("goblin.jpg");
    // An index absent from the scan result stays undefined, not "".
    expect(localTokenArtVariants("owlbear")).toBeUndefined();
  });

  it("falls back to empty on malformed JSON from the binding", async () => {
    (window as any).go = {
      main: { App: { ScanLocalMonsterArt: async () => "not json" } },
    };

    await loadLocalMonsterArtOverrides();

    expect(localTokenArtVariants("goblin")).toBeUndefined();
    expect(localPortraitFile("goblin")).toBeUndefined();
  });

  it("falls back to empty when the binding call rejects", async () => {
    (window as any).go = {
      main: {
        App: {
          ScanLocalMonsterArt: async () => {
            throw new Error("boom");
          },
        },
      },
    };

    await loadLocalMonsterArtOverrides();

    expect(localTokenArtVariants("goblin")).toBeUndefined();
    expect(localPortraitFile("goblin")).toBeUndefined();
  });

  it("does not leak a previous successful scan into the next load", async () => {
    (window as any).go = {
      main: {
        App: {
          ScanLocalMonsterArt: async () =>
            JSON.stringify({
              tokenArt: { goblin: [{ file: "g.png", width: 1, height: 1 }] },
              portraits: {},
            }),
        },
      },
    };
    await loadLocalMonsterArtOverrides();
    expect(localTokenArtVariants("goblin")).toBeDefined();

    // A second load against an empty/no-binding state must clear it,
    // not merge with the previous result.
    delete (window as any).go;
    await loadLocalMonsterArtOverrides();
    expect(localTokenArtVariants("goblin")).toBeUndefined();
  });
});

describe("monsterArtLocal — settings UI bindings", () => {
  it("getLocalMonsterArtRoot resolves undefined with no window.go binding", async () => {
    delete (window as any).go;
    expect(await getLocalMonsterArtRoot()).toBeUndefined();
  });

  it("getLocalMonsterArtRoot returns the path from the Go binding", async () => {
    (window as any).go = {
      main: { App: { GetLocalMonsterArtRoot: async () => "C:\\Artisan\\art" } },
    };
    expect(await getLocalMonsterArtRoot()).toBe("C:\\Artisan\\art");
  });

  it("getLocalMonsterArtRoot swallows a rejected binding call", async () => {
    (window as any).go = {
      main: {
        App: {
          GetLocalMonsterArtRoot: async () => {
            throw new Error("boom");
          },
        },
      },
    };
    expect(await getLocalMonsterArtRoot()).toBeUndefined();
  });

  it("pickLocalMonsterArtRoot resolves undefined with no binding or on cancel", async () => {
    delete (window as any).go;
    expect(await pickLocalMonsterArtRoot()).toBeUndefined();

    (window as any).go = {
      main: { App: { PickLocalMonsterArtRoot: async () => "" } },
    };
    expect(await pickLocalMonsterArtRoot()).toBeUndefined();
  });

  it("pickLocalMonsterArtRoot returns the chosen path", async () => {
    (window as any).go = {
      main: { App: { PickLocalMonsterArtRoot: async () => "D:\\packs\\fa" } },
    };
    expect(await pickLocalMonsterArtRoot()).toBe("D:\\packs\\fa");
  });

  it("pickImportSourceDirectory forwards the dialog title and resolves undefined on cancel", async () => {
    let receivedTitle: string | undefined;
    (window as any).go = {
      main: {
        App: {
          PickImportSourceDirectory: async (title: string) => {
            receivedTitle = title;
            return "";
          },
        },
      },
    };
    expect(await pickImportSourceDirectory("Escolher pasta")).toBeUndefined();
    expect(receivedTitle).toBe("Escolher pasta");
  });

  it("importLocalMonsterArtPack throws in the web build instead of silently no-op'ing", async () => {
    delete (window as any).go;
    await expect(
      importLocalMonsterArtPack("C:\\src\\tokens", undefined)
    ).rejects.toThrow(/desktop/i);
  });

  it("importLocalMonsterArtPack passes empty strings for omitted sources and reloads overrides", async () => {
    let receivedArgs: unknown[] = [];
    (window as any).go = {
      main: {
        App: {
          ImportLocalMonsterArtPack: async (...args: unknown[]) => {
            receivedArgs = args;
            return JSON.stringify({
              tokenArtMonsters: 1,
              tokenArtFiles: 2,
              tokenArtSkipped: 0,
              portraits: 0,
              portraitsSkipped: 0,
            });
          },
          // loadLocalMonsterArtOverrides is called internally afterwards.
          ScanLocalMonsterArt: async () =>
            JSON.stringify({ tokenArt: {}, portraits: {} }),
        },
      },
    };

    const result = await importLocalMonsterArtPack("C:\\src\\tokens", undefined);

    expect(receivedArgs).toEqual(["C:\\src\\tokens", ""]);
    expect(result).toEqual({
      tokenArtMonsters: 1,
      tokenArtFiles: 2,
      tokenArtSkipped: 0,
      portraits: 0,
      portraitsSkipped: 0,
    });
  });
});
