import React from "react";

import { useArtisanStore } from "../state/artisanStore";

export type AssetLoadStartEventHandler = () => void;
export type AssetLoadFinishEventHandler = () => void;

type DiceLoadingContextValue = {
  assetLoadStart: AssetLoadStartEventHandler;
  assetLoadFinish: AssetLoadFinishEventHandler;
  isLoading: boolean;
};

export function DiceLoadingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

export function useDiceLoading(): DiceLoadingContextValue {
  const isLoading = useArtisanStore((state) => state.diceLoading);
  const assetLoadStart = useArtisanStore((state) => state.diceAssetLoadStart);
  const assetLoadFinish = useArtisanStore((state) => state.diceAssetLoadFinish);

  return { assetLoadStart, assetLoadFinish, isLoading };
}
