import { createContext, useContext, type MutableRefObject } from "react";
import type Konva from "konva";

/** A ref to the Konva stage backing the map, shared via context. */
export type MapStage = MutableRefObject<Konva.Stage | null>;

/**
 * Builds a `createContext` + required-read hook pair in one call, so the
 * "must be used within a Provider" guard lives in exactly one place
 * instead of being retyped per context. Only one context needs this
 * today (the map's Konva stage ref), but writing it as a factory keeps
 * the guard's wording and behaviour identical if a second ref-only
 * context is ever added here.
 */
function createRequiredRefContext<T>(providerName: string) {
  const context = createContext<T | undefined>(undefined);
  function useRequired(): T {
    const value = useContext(context);
    if (value === undefined) {
      throw new Error(`must be used within a ${providerName}`);
    }
    return value;
  }
  return { context, useRequired };
}

const { context: mapStageContext, useRequired: useMapStage } =
  createRequiredRefContext<MapStage>("MapStageProvider");

export const MapStageProvider = mapStageContext.Provider;
export { useMapStage };
export default mapStageContext;
