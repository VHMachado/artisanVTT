import { afterEach, describe, expect, test, vi } from "vitest";

const { get, put, toArray, update, remove, fetchAssetBlob } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  toArray: vi.fn(() => []),
  update: vi.fn(() => Promise.resolve()),
  remove: vi.fn(),
  fetchAssetBlob: vi.fn(),
}));

vi.mock("./assetUpload", () => ({ fetchAssetBlob }));
vi.mock("./tablesDatabase", () => ({
  getTablesDatabase: () => ({
    table: () => ({ get, put, toArray, update, delete: remove }),
  }),
}));

import { brokerAssetObjectURL } from "./brokerAssetCache";

describe("brokerAssetObjectURL", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const createObjectURL = vi.fn(() => "blob:cached-image");

  afterEach(() => {
    get.mockReset();
    put.mockReset();
    toArray.mockReset();
    toArray.mockResolvedValue([]);
    update.mockReset();
    update.mockResolvedValue(undefined);
    remove.mockReset();
    fetchAssetBlob.mockReset();
    createObjectURL.mockReset();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  test("uses bytes already persisted on this device without contacting the broker", async () => {
    URL.createObjectURL = createObjectURL;
    get.mockResolvedValue({
      id: "known-hash",
      mime: "image/webp",
      file: new Uint8Array([1, 2, 3]),
    });

    await expect(
      brokerAssetObjectURL({ token: "token" } as never, "known-hash")
    ).resolves.toBe("blob:cached-image");

    expect(fetchAssetBlob).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ type: "image/webp", size: 3 })
    );
  });

  test("downloads once then persists the Blob without a byte-array copy", async () => {
    URL.createObjectURL = createObjectURL;
    get.mockResolvedValue(undefined);
    const blob = new Blob([new Uint8Array([7, 8, 9])], { type: "image/png" });
    fetchAssetBlob.mockResolvedValue(blob);

    await expect(
      brokerAssetObjectURL({ token: "token" } as never, "new-hash")
    ).resolves.toBe("blob:cached-image");

    expect(fetchAssetBlob).toHaveBeenCalledWith({ token: "token" }, "new-hash");
    expect(put).toHaveBeenCalledWith({
      id: "new-hash",
      mime: "image/png",
      file: blob,
      size: 3,
      accessedAt: expect.any(Number),
    });
  });

  test("deduplicates concurrent cold-cache downloads while returning a URL to each caller", async () => {
    URL.createObjectURL = createObjectURL;
    get.mockResolvedValue(undefined);
    let resolveBlob: (blob: Blob) => void = () => undefined;
    fetchAssetBlob.mockImplementation(
      () => new Promise<Blob>((resolve) => { resolveBlob = resolve; })
    );

    const first = brokerAssetObjectURL({ token: "token" } as never, "same-hash");
    const second = brokerAssetObjectURL({ token: "token" } as never, "same-hash");
    await vi.waitFor(() => expect(fetchAssetBlob).toHaveBeenCalledTimes(1));
    resolveBlob(new Blob(["cached"], { type: "image/png" }));

    await expect(Promise.all([first, second])).resolves.toEqual([
      "blob:cached-image",
      "blob:cached-image",
    ]);
    expect(put).toHaveBeenCalledTimes(1);
  });
});
