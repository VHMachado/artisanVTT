import React, { useCallback, useEffect, useState } from "react";
import * as Comlink from "comlink";
import { encode } from "@msgpack/msgpack";
import { useLiveQuery } from "dexie-react-hooks";

import { isMonsterTokenArtKey, monsterTokenArtUrl } from "../5e/monsterTokenArt";
import useDebounce from "../hooks/useDebounce";
import { omit } from "../helpers/shared";
import { useArtisanStore, type AssetURLs } from "../state/artisanStore";
import type { Asset } from "../types/Asset";
import { useDatabase } from "./DatabaseContext";

export type GetAssetEventHanlder = (assetId: string) => Promise<Asset | undefined>;
export type AddAssetsEventHandler = (assets: Asset[]) => Promise<void>;
export type PutAssetEventsHandler = (asset: Asset) => Promise<void>;

type AssetOperations = {
  getAsset: GetAssetEventHanlder;
  addAssets: AddAssetsEventHandler;
  putAsset: PutAssetEventsHandler;
};

type FileData = {
  file: string;
  type: "file";
  thumbnail?: string;
  quality?: string;
  resolutions?: Record<string, string>;
};

type DefaultData = { key: string; type: "default" };
type URLData = FileData | DefaultData;

const maxCacheSize = 1e8;

function addAssetReference(urls: AssetURLs, id: string): AssetURLs {
  const entry = urls[id];
  if (entry) {
    return { ...urls, [id]: { ...entry, references: entry.references + 1 } };
  }
  return { ...urls, [id]: { id, url: null, references: 1 } };
}

function removeAssetReference(urls: AssetURLs, id: string): AssetURLs {
  const entry = urls[id];
  return entry
    ? { ...urls, [id]: { ...entry, references: entry.references - 1 } }
    : urls;
}

function unresolvedAssetIds(urls: AssetURLs): string[] {
  return Object.values(urls)
    .filter(({ url }) => url === null)
    .map(({ id }) => id);
}

function addLoadedURLs(urls: AssetURLs, assets: readonly (Asset | undefined)[]): AssetURLs {
  const updated = { ...urls };
  for (const asset of assets) {
    const entry = asset && updated[asset.id];
    if (asset && entry?.url === null) {
      updated[asset.id] = {
        ...entry,
        url: URL.createObjectURL(new Blob([asset.file], { type: asset.mime })),
      };
    }
  }
  return updated;
}

function discardUnreferencedURLs(urls: AssetURLs): AssetURLs {
  const ids = Object.values(urls).flatMap(({ id, references, url }) => {
    if (references > 0) {
      return [];
    }
    if (url) {
      URL.revokeObjectURL(url);
    }
    return [id];
  });
  return ids.length === 0 ? urls : omit(urls, ids);
}

function selectedAssetId(data: URLData, wantsThumbnail: boolean): string {
  if (data.type === "default") {
    return data.key;
  }
  if (wantsThumbnail && data.thumbnail) {
    return data.thumbnail;
  }
  if (data.quality && data.quality !== "original" && data.resolutions) {
    return data.resolutions[data.quality];
  }
  return data.file;
}

function resolveAssetURL(
  assetId: string | null,
  type: URLData["type"] | null,
  assetURLs: AssetURLs,
  defaultSources: Record<string, string>,
  unknownSource?: string
) {
  if (!assetId) {
    return unknownSource;
  }
  if (type === "file") {
    return assetURLs[assetId]?.url || unknownSource;
  }
  if (type === "default") {
    return isMonsterTokenArtKey(assetId)
      ? monsterTokenArtUrl(assetId) || unknownSource
      : defaultSources[assetId];
  }
  return unknownSource;
}

function useSelectedAssetId(data: URLData | null, wantsThumbnail: boolean) {
  const [assetId, setAssetId] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setAssetId(selectedAssetId(data, wantsThumbnail));
    }
  }, [data, wantsThumbnail]);

  return assetId;
}

function useAssetOperations(): AssetOperations {
  const { database, worker } = useDatabase();

  const getAsset = useCallback<GetAssetEventHanlder>(
    async (assetId) => database?.table("assets").get(assetId),
    [database]
  );
  const addAssets = useCallback<AddAssetsEventHandler>(
    async (assets) => {
      if (database) {
        await database.table("assets").bulkAdd(assets);
      }
    },
    [database]
  );
  const putAsset = useCallback<PutAssetEventsHandler>(
    async (asset) => {
      if (!database) {
        return;
      }
      if (window.BroadcastChannel) {
        const packed = encode(asset);
        const storedByWorker = await worker.putData(
          Comlink.transfer(packed, [packed.buffer]),
          "assets"
        );
        if (storedByWorker) {
          return;
        }
      }
      await database.table("assets").put(asset);
    },
    [database, worker]
  );

  return { getAsset, addAssets, putAsset };
}

/** Maintains the worker-side asset cache for the current game route. */
export function AssetsProvider({ children }: { children: React.ReactNode }) {
  const { databaseStatus, worker } = useDatabase();

  useEffect(() => {
    if (databaseStatus === "loaded") {
      worker.cleanAssetCache(maxCacheSize);
    }
  }, [databaseStatus, worker]);

  return <>{children}</>;
}

/** Uses the Dexie/worker bridge directly instead of a React context value. */
export function useAssets(): AssetOperations {
  return useAssetOperations();
}

/** Keeps the shared blob-URL cache alive for the mounted game route. */
export function AssetURLsProvider({ children }: { children: React.ReactNode }) {
  const assetURLs = useArtisanStore((state) => state.assetURLs);
  const updateAssetURLs = useArtisanStore((state) => state.updateAssetURLs);
  const { database } = useDatabase();
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const pendingURLs = useDebounce(assetURLs, 100);

  useEffect(() => {
    if (!pendingURLs) {
      return;
    }
    const ids = unresolvedAssetIds(pendingURLs);
    if (ids.length > 0) {
      setAssetIds(ids);
    }
  }, [pendingURLs]);

  const assets = useLiveQuery<Asset[]>(
    () => database?.table("assets").bulkGet(assetIds) || [],
    [database, assetIds]
  );

  useEffect(() => {
    if (!assets || assets.length === 0) {
      return;
    }
    setAssetIds([]);
    updateAssetURLs((urls) => addLoadedURLs(urls, assets));
  }, [assets, updateAssetURLs]);

  const cleanupClock = useDebounce(assetURLs, 60 * 1000);
  useEffect(() => {
    updateAssetURLs(discardUnreferencedURLs);
  }, [cleanupClock, updateAssetURLs]);

  return <>{children}</>;
}

/** Resolves a file cache entry or built-in source, retaining files while mounted. */
export function useAssetURL(
  assetId: string | null,
  type: "file" | "default" | null,
  defaultSources: Record<string, string>,
  unknownSource?: string
) {
  const assetURLs = useArtisanStore((state) => state.assetURLs);
  const updateAssetURLs = useArtisanStore((state) => state.updateAssetURLs);

  useEffect(() => {
    if (!assetId || type !== "file") {
      return;
    }
    updateAssetURLs((urls) => addAssetReference(urls, assetId));
    return () => updateAssetURLs((urls) => removeAssetReference(urls, assetId));
  }, [assetId, type, updateAssetURLs]);

  return resolveAssetURL(assetId, type, assetURLs, defaultSources, unknownSource);
}

/** Resolves map/token data, including thumbnail and selected-resolution files. */
export function useDataURL(
  data: URLData | null,
  defaultSources: Record<string, string>,
  unknownSource: string | undefined = undefined,
  thumbnail = false
) {
  const assetId = useSelectedAssetId(data, thumbnail);
  return useAssetURL(assetId, data?.type || null, defaultSources, unknownSource);
}