import React, { useLayoutEffect } from "react";
import { FullGestureState } from "react-use-gesture/dist/types";
import Konva from "konva";

import useDebounce from "../hooks/useDebounce";
import TypedEmitter from "../helpers/TypedEmitter";
import { useArtisanStore, ArtisanState } from "../state/artisanStore";

export type MapDragEvent = Omit<FullGestureState<"drag">, "event"> & {
  event: React.PointerEvent<Element> | PointerEvent;
};

type MapDragEventHandler = (props: MapDragEvent) => void;

export interface MapInteractionEvents
  extends Record<"dragStart" | "drag" | "dragEnd", MapDragEventHandler> {}

export class MapInteractionEmitter extends TypedEmitter<MapInteractionEvents> {}

type StageDimensions = { stageWidth: number; stageHeight: number };
type MapDimensions = { mapWidth: number; mapHeight: number };

type MapInteraction = StageDimensions &
  MapDimensions & {
    stageScale: number;
    setStageScale: React.Dispatch<React.SetStateAction<number>>;
    setPreventMapInteraction: React.Dispatch<React.SetStateAction<boolean>>;
    interactionEmitter: MapInteractionEmitter | null;
  };

type MapInteractionProviderProps = {
  value: MapInteraction;
  children: React.ReactNode;
};

/** Bridges a Konva mount into the shared viewport state. */
export function MapInteractionProvider(props: MapInteractionProviderProps) {
  const { value, children } = props;
  const hydrateViewport = useArtisanStore((state) => state.hydrateViewport);
  const preventMapInteraction = useArtisanStore(
    (state) => state.preventMapInteraction
  );

  useLayoutEffect(() => {
    hydrateViewport({ ...value, preventMapInteraction });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrateViewport, preventMapInteraction, value]);

  return <>{children}</>;
}

/** Builds a zero-arg hook that reads one field off the artisan store —
 * every `useStageWidth`/`useStageHeight`/... below was the same
 * `return useArtisanStore((state) => state.<field>)` body with nothing
 * but the field name differing. */
function selectorHook<K extends keyof ArtisanState>(key: K) {
  return () => useArtisanStore((state) => state[key]);
}

export const useSetStageScale = selectorHook("setStageScale");
export const useInteractionEmitter = selectorHook("interactionEmitter");
export const useSetPreventMapInteraction = selectorHook(
  "setPreventMapInteraction"
);
export const useStageWidth = selectorHook("stageWidth");
export const useStageHeight = selectorHook("stageHeight");
export const useMapWidth = selectorHook("mapWidth");
export const useMapHeight = selectorHook("mapHeight");
export const useStageScale = selectorHook("stageScale");

export function useDebouncedStageScale() {
  return useDebounce(useStageScale(), 200) || 1;
}

type MouseButtonEvent =
  | MapDragEvent
  | Konva.KonvaEventObject<PointerEvent | MouseEvent>;

/** Whether `event` represents a left-button press — the one gesture type
 * every drag tool actually cares about. Takes either shape this app
 * passes around (a raw `MapDragEvent` from `interactionEmitter`, or a
 * Konva pointer/mouse event) instead of three overload signatures for
 * what's really the same two-case check below. */
export function leftMouseButton(event: MouseButtonEvent): boolean {
  if ("evt" in event) {
    return event.evt.button === undefined || event.evt.button === 0;
  }
  return event.buttons <= 1;
}

export function middleMouseButton(event: MapDragEvent) {
  return event.buttons === 4;
}

export function rightMouseButton(event: MapDragEvent) {
  return event.buttons === 2;
}
