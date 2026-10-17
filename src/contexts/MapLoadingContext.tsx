import React from "react";

import { useArtisanStore } from "../state/artisanStore";

type AssetLoadProgress = {
  count: number;
  total: number;
};

type AssetLoadProgressUpdate = AssetLoadProgress & {
  id: string;
};

type MapLoadingContextValue = {
  isLoading: boolean;
  assetLoadStart: (id: string) => void;
  assetProgressUpdate: (update: AssetLoadProgressUpdate) => void;
  loadingProgressRef: React.MutableRefObject<number>;
};

/**
 * Tracks the overall load progress of a map's assets. Each asset reports
 * its own count/total as it streams in; the combined progress is the mean
 * of every tracked asset's fraction complete.
 *
 * The bookkeeping lives in the `artisanStore` map-loading slice
 * instead of a `createContext` — no provider is needed any more, but
 * `MapLoadingProvider` is kept as a no-op passthrough so call sites that
 * still wrap `children` in it don't need to change.
 */
export function MapLoadingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

export function useMapLoading(): MapLoadingContextValue {
  const mapLoading = useArtisanStore((state) => state.mapLoading);
  const assetLoadStart = useArtisanStore((state) => state.mapAssetLoadStart);
  const assetProgressUpdate = useArtisanStore(
    (state) => state.mapAssetProgressUpdate
  );

  return {
    isLoading: mapLoading.isLoading,
    assetLoadStart,
    assetProgressUpdate,
    loadingProgressRef: mapLoading.loadingProgressRef,
  };
}
