import type { SetStateAction } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import Action from "../actions/Action";
import type { MapInteractionEmitter } from "../contexts/MapInteractionContext";
import type { SetNetworkedState } from "../hooks/useNetworkedState";
import type { FogState } from "../types/Fog";
import type { Group } from "../types/Group";
import type { Map } from "../types/Map";
import type { MapNpc } from "../types/MapNpc";
import type { MapState } from "../types/MapState";
import type { PartyState } from "../types/PartyState";
import type { PlayerState } from "../types/PlayerState";
import type { Selection } from "../types/Select";
import type { TokenStates } from "../types/TokenState";

type AssetURL = {
  url: string | null;
  id: string;
  references: number;
};

type AssetURLs = Record<string, AssetURL>;

type IdentitySlice = {
  userId?: string;
  setUserId: (userId?: string) => void;
};

type AssetUrlSlice = {
  assetURLs: AssetURLs;
  replaceAssetURLs: (assetURLs: AssetURLs) => void;
  updateAssetURLs: (update: SetStateAction<AssetURLs>) => void;
};

type LibrarySnapshot = {
  maps: Map[];
  mapStates: MapState[];
  mapGroups: Group[];
  mapsLoading: boolean;
};

type LibrarySlice = LibrarySnapshot & {
  mapsById: Record<string, Map>;
  replaceLibrary: (snapshot: LibrarySnapshot) => void;
};

function indexMaps(maps: Map[]): Record<string, Map> {
  return maps.reduce<Record<string, Map>>((byId, map) => {
    byId[map.id] = map;
    return byId;
  }, {});
}

type SelectableGroup = { id: string };
export type ShelfSelectMode = "single" | "multiple" | "range";

/** Applies the tile shelf's single, additive and contiguous range rules. */
export function selectShelfGroupIds(
  selectedIds: string[],
  mode: ShelfSelectMode,
  visibleGroups: readonly SelectableGroup[],
  selectedId: string
): string[] {
  if (mode === "single") {
    return [selectedId];
  }

  if (mode === "multiple") {
    return selectedIds.includes(selectedId)
      ? selectedIds.filter((id) => id !== selectedId)
      : [...selectedIds, selectedId];
  }

  const anchorId = selectedIds[selectedIds.length - 1];
  if (!anchorId) {
    return [selectedId];
  }

  const anchorIndex = visibleGroups.findIndex((group) => group.id === anchorId);
  const selectedIndex = visibleGroups.findIndex(
    (group) => group.id === selectedId
  );
  if (anchorIndex < 0 || selectedIndex < 0) {
    return selectedIds;
  }

  const direction = selectedIndex >= anchorIndex ? 1 : -1;
  const additions: string[] = [];
  const removals = new Set<string>();
  for (
    let index = anchorIndex + direction;
    direction > 0 ? index <= selectedIndex : index >= selectedIndex;
    index += direction
  ) {
    const id = visibleGroups[index].id;
    if (selectedIds.includes(id)) {
      removals.add(id);
    } else {
      additions.push(id);
    }
  }

  return [...selectedIds, ...additions].filter((id) => !removals.has(id));
}

type ShelfSlice = {
  draggedTileId: string | null;
  hoveredTileGroupId: string | null;
  tileDragCursor: string;
  startTileDrag: (id: string) => void;
  updateTileDragTarget: (groupId: string | null, cursor: string) => void;
  finishTileDrag: () => void;

  shelfSelectMode: ShelfSelectMode;
  openShelfGroupId?: string;
  shelfFilter?: string;
  selectedShelfGroupIds: string[];
  setShelfSelectMode: (mode: ShelfSelectMode) => void;
  openShelfGroup: (groupId: string) => void;
  closeShelfGroup: () => void;
  setShelfFilter: (filter: string) => void;
  clearShelfFilter: () => void;
  selectShelfGroup: (
    groupId: string,
    visibleGroups: readonly SelectableGroup[]
  ) => void;
  clearShelfSelection: () => void;
  resetShelf: () => void;
};

type ViewportSnapshot = {
  stageScale: number;
  stageWidth: number;
  stageHeight: number;
  mapWidth: number;
  mapHeight: number;
  preventMapInteraction: boolean;
  interactionEmitter: MapInteractionEmitter | null;
};

type ViewportSlice = ViewportSnapshot & {
  setStageScale: (value: SetStateAction<number>) => void;
  setViewportSize: (width: number, height: number) => void;
  setMapSize: (width: number, height: number) => void;
  setPreventMapInteraction: (value: SetStateAction<boolean>) => void;
  setInteractionEmitter: (emitter: MapInteractionEmitter | null) => void;
  hydrateViewport: (snapshot: ViewportSnapshot) => void;
};

/**
 * One undoable unit of mesa mutation. Mirrors the shape the network layer
 * (`NetworkedMapAndTokens`) already dispatches, so moving the history
 * bookkeeping here changes nothing about what callers pass in.
 */
export type FogsAction = { type: "fogs"; action: Action<FogState> };
export type TokensAction = { type: "tokens"; action: Action<TokenStates> };
export type MapAction = FogsAction | TokensAction;

export type MapActionHistory = {
  actions: MapAction[][];
  actionIndex: number;
};

const emptyMapActionHistory: MapActionHistory = {
  actions: [],
  actionIndex: -1,
};

/**
 * What the store hands back to the caller of `moveMapActionIndex` so it can
 * actually mutate the networked `MapState` — the store holds the history
 * and the cursor, never the `MapState` itself (that stays owned by
 * `useNetworkedState`, per this design). `direction` says whether
 * the returned batches must be applied (redo, moving forward) or undone
 * (undo, moving backward); `batches` is already in the order the caller
 * should fold them over the map state.
 */
export type MapActionTransition = {
  direction: "apply" | "undo";
  batches: MapAction[][];
};

type MesaSlice = {
  currentMapId?: string;
  isCurrentMapOwner: boolean;
  placedCharacterIds: ReadonlySet<string>;
  placedNpcIds: ReadonlySet<string>;
  setCurrentMap: (mapId: string | undefined, isOwner: boolean) => void;
  setPlacedTokenEntities: (
    characterIds: ReadonlySet<string>,
    npcIds: ReadonlySet<string>
  ) => void;

  mapSelection: Selection | null;
  setMapSelection: (selection: Selection | null) => void;
  updateMapSelection: (
    update: (selection: Selection | null) => Selection | null
  ) => void;
  clearMapSelection: () => void;

  mapActionHistory: MapActionHistory;
  addMapActionBatch: (batch: MapAction[]) => void;
  moveMapActionIndex: (change: number) => MapActionTransition;
  resetMapActionHistory: () => void;
};

/**
 * The player's own observable snapshot (nickname, shared dice rolls,
 * session/account linkage) projected onto the store so a sibling far
 * from `PlayerProvider` (e.g. `CharacterRoster`) can read it without a
 * context boundary. `PlayerProvider` stays the sole OWNER: it keeps
 * running `useNetworkedState("player_state")` itself (socket
 * connect/reconnect/status listeners, Dexie nickname hydration) exactly
 * as before and projects the resulting state + setter here after each
 * committed render — the store never dispatches a network write on its own.
 */
type PlayerSlice = {
  playerState?: PlayerState;
  playerUpdater?: SetNetworkedState<PlayerState>;
  publishPlayerState: (
    playerState: PlayerState,
    playerUpdater: SetNetworkedState<PlayerState>
  ) => void;
};

/**
 * The OTHER connected players' public state, keyed by socket session id,
 * and the current map's NPC roster — both are plain cross-tree
 * PROJECTIONS exactly like `PlayerSlice` above: `PartyProvider` stays the
 * socket listener, `MapNpcsProvider` stays the Dexie `useLiveQuery` owner,
 * each publishing its computed snapshot here every render so a sibling
 * far from the provider (CharacterRoster, NpcRoster) can read it without
 * a context boundary.
 */
type PartySlice = {
  partyState: PartyState;
  publishPartyState: (partyState: PartyState) => void;
};

type MapNpcsSlice = {
  mapNpcs: MapNpc[];
  publishMapNpcs: (mapNpcs: MapNpc[]) => void;
};

type AssetLoadProgress = {
  count: number;
  total: number;
};

type AssetLoadProgressUpdate = AssetLoadProgress & {
  id: string;
};

type MapLoadingSnapshot = {
  isLoading: boolean;
  loadingProgressRef: { current: number };
};

/**
 * Tracks the overall load progress of a MAP's assets (one Mesa's image +
 * token art, reset every time a different map loads) — each asset
 * reports its own count/total as it streams in; the combined progress is
 * the mean of every tracked asset's fraction complete. `loadingProgressRef`
 * stays a ref rather than a plain number so a progress-bar consumer can
 * read it every animation frame without this slice re-rendering the
 * whole tree on every chunk (same reasoning `MapLoadingContext` always
 * had — this migration only drops the `createContext` boundary).
 */
type MapLoadingSlice = {
  mapLoading: MapLoadingSnapshot;
  mapAssetLoadStart: (id: string) => void;
  mapAssetProgressUpdate: (update: AssetLoadProgressUpdate) => void;
};

/** Concurrent-load counter for the dice tray's Babylon meshes — distinct
 * from `MapLoadingSlice` above (different assets, different lifetime: a
 * die mesh loads once per app session, a map's assets reload per map). */
type DiceLoadingSlice = {
  diceLoading: boolean;
  diceAssetLoadStart: () => void;
  diceAssetLoadFinish: () => void;
};

export type ArtisanState =
  IdentitySlice &
    AssetUrlSlice &
    LibrarySlice &
    ShelfSlice &
    ViewportSlice &
    MesaSlice &
    PlayerSlice &
    PartySlice &
    MapNpcsSlice &
    MapLoadingSlice &
    DiceLoadingSlice;

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * Makes a self-contained store for an Artisan application tree. The store
 * holds observable UI state only; Dexie, workers, sockets and Konva refs stay
 * owned by their integration hooks.
 */
export function createArtisanStore() {
  // Per-instance bookkeeping that is never read by a component directly —
  // only `mapLoading.loadingProgressRef` (itself a stable ref object) is.
  // Keeping the per-asset breakdown out of `set` state means a progress
  // chunk arriving for asset N doesn't ask Zustand to diff/notify
  // subscribers for data nothing ever subscribes to.
  const mapAssetProgressById: Record<string, AssetLoadProgress> = {};
  const mapLoadingProgressRef = { current: 0 };
  let pendingDiceAssetLoads = 0;

  return createStore<ArtisanState>((set, get) => ({
    userId: undefined,
    setUserId: (userId) => set({ userId }),

    assetURLs: {},
    replaceAssetURLs: (assetURLs) => set({ assetURLs }),
    updateAssetURLs: (update) =>
      set((state) => ({
        assetURLs:
          typeof update === "function" ? update(state.assetURLs) : update,
      })),

    maps: [],
    mapStates: [],
    mapGroups: [],
    mapsLoading: true,
    mapsById: {},
    replaceLibrary: ({ maps, mapStates, mapGroups, mapsLoading }) =>
      set({ maps, mapStates, mapGroups, mapsLoading, mapsById: indexMaps(maps) }),

    draggedTileId: null,
    hoveredTileGroupId: null,
    tileDragCursor: "pointer",
    startTileDrag: (draggedTileId) =>
      set({
        draggedTileId,
        hoveredTileGroupId: null,
        tileDragCursor: "grabbing",
      }),
    updateTileDragTarget: (hoveredTileGroupId, tileDragCursor) =>
      set({ hoveredTileGroupId, tileDragCursor }),
    finishTileDrag: () =>
      set({
        draggedTileId: null,
        hoveredTileGroupId: null,
        tileDragCursor: "pointer",
      }),

    shelfSelectMode: "single",
    openShelfGroupId: undefined,
    shelfFilter: undefined,
    selectedShelfGroupIds: [],
    setShelfSelectMode: (shelfSelectMode) => set({ shelfSelectMode }),
    openShelfGroup: (openShelfGroupId) =>
      set({ openShelfGroupId, selectedShelfGroupIds: [] }),
    closeShelfGroup: () =>
      set({ openShelfGroupId: undefined, selectedShelfGroupIds: [] }),
    setShelfFilter: (shelfFilter) =>
      set((state) => ({
        shelfFilter,
        openShelfGroupId: shelfFilter ? undefined : state.openShelfGroupId,
      })),
    clearShelfFilter: () => set({ shelfFilter: undefined }),
    selectShelfGroup: (groupId, visibleGroups) =>
      set((state) => ({
        selectedShelfGroupIds: selectShelfGroupIds(
          state.selectedShelfGroupIds,
          state.shelfSelectMode,
          visibleGroups,
          groupId
        ),
      })),
    clearShelfSelection: () => set({ selectedShelfGroupIds: [] }),
    resetShelf: () =>
      set({
        openShelfGroupId: undefined,
        shelfFilter: undefined,
        selectedShelfGroupIds: [],
        draggedTileId: null,
        hoveredTileGroupId: null,
        tileDragCursor: "pointer",
      }),

    stageScale: 1,
    stageWidth: 1,
    stageHeight: 1,
    mapWidth: 0,
    mapHeight: 0,
    preventMapInteraction: false,
    interactionEmitter: null,
    setStageScale: (value) =>
      set((state) => ({
        stageScale:
          typeof value === "function" ? value(state.stageScale) : value,
      })),
    setViewportSize: (stageWidth, stageHeight) => set({ stageWidth, stageHeight }),
    setMapSize: (mapWidth, mapHeight) => set({ mapWidth, mapHeight }),
    setPreventMapInteraction: (value) =>
      set((state) => ({
        preventMapInteraction:
          typeof value === "function"
            ? value(state.preventMapInteraction)
            : value,
      })),
    setInteractionEmitter: (interactionEmitter) => set({ interactionEmitter }),
    hydrateViewport: (snapshot) => set(snapshot),

    currentMapId: undefined,
    isCurrentMapOwner: false,
    placedCharacterIds: EMPTY_SET,
    placedNpcIds: EMPTY_SET,
    setCurrentMap: (currentMapId, isCurrentMapOwner) =>
      set({ currentMapId, isCurrentMapOwner }),
    setPlacedTokenEntities: (placedCharacterIds, placedNpcIds) =>
      set({ placedCharacterIds, placedNpcIds }),

    mapSelection: null,
    setMapSelection: (mapSelection) => set({ mapSelection }),
    updateMapSelection: (update) =>
      set((state) => ({ mapSelection: update(state.mapSelection) })),
    clearMapSelection: () => set({ mapSelection: null }),

    mapActionHistory: emptyMapActionHistory,
    addMapActionBatch: (batch) =>
      set((state) => {
        // Discard any undone-then-abandoned redo tail before appending —
        // a fresh gesture after an undo replaces what would have been redone.
        const actions = [
          ...state.mapActionHistory.actions.slice(
            0,
            state.mapActionHistory.actionIndex + 1
          ),
          batch,
        ];
        return {
          mapActionHistory: { actions, actionIndex: actions.length - 1 },
        };
      }),
    moveMapActionIndex: (change) => {
      const { actions, actionIndex: prevIndex } = get().mapActionHistory;
      const newIndex = Math.min(
        Math.max(prevIndex + change, -1),
        actions.length - 1
      );
      set((state) => ({
        mapActionHistory: { ...state.mapActionHistory, actionIndex: newIndex },
      }));
      if (newIndex > prevIndex) {
        return { direction: "apply", batches: actions.slice(prevIndex + 1, newIndex + 1) };
      }
      if (newIndex < prevIndex) {
        // Undo order is last-applied-first: reverse the forward slice.
        return {
          direction: "undo",
          batches: actions.slice(newIndex + 1, prevIndex + 1).reverse(),
        };
      }
      return { direction: change >= 0 ? "apply" : "undo", batches: [] };
    },
    resetMapActionHistory: () => set({ mapActionHistory: emptyMapActionHistory }),

    playerState: undefined,
    playerUpdater: undefined,
    publishPlayerState: (playerState, playerUpdater) =>
      set((state) => {
        if (
          state.playerState === playerState &&
          state.playerUpdater === playerUpdater
        ) {
          return state;
        }
        return { playerState, playerUpdater };
      }),

    partyState: {},
    publishPartyState: (partyState) => set({ partyState }),

    mapNpcs: [],
    publishMapNpcs: (mapNpcs) => set({ mapNpcs }),

    mapLoading: { isLoading: false, loadingProgressRef: mapLoadingProgressRef },
    mapAssetLoadStart: (id) => {
      mapAssetProgressById[id] = { count: 0, total: 1 };
      set((state) => ({ mapLoading: { ...state.mapLoading, isLoading: true } }));
    },
    mapAssetProgressUpdate: ({ id, count, total }) => {
      mapAssetProgressById[id] = { count, total };
      const trackedAssets = Object.values(mapAssetProgressById);
      const fractionsComplete = trackedAssets.map(
        (asset) => asset.count / asset.total
      );
      const combined =
        fractionsComplete.reduce((sum, fraction) => sum + fraction, 0) /
        trackedAssets.length;
      mapLoadingProgressRef.current = combined;

      if (combined === 1) {
        for (const key of Object.keys(mapAssetProgressById)) {
          delete mapAssetProgressById[key];
        }
        set({
          mapLoading: { isLoading: false, loadingProgressRef: mapLoadingProgressRef },
        });
      } else {
        set((state) => ({
          mapLoading: { ...state.mapLoading, isLoading: true },
        }));
      }
    },

    diceLoading: false,
    diceAssetLoadStart: () => {
      pendingDiceAssetLoads += 1;
      set({ diceLoading: true });
    },
    diceAssetLoadFinish: () => {
      pendingDiceAssetLoads = Math.max(0, pendingDiceAssetLoads - 1);
      set({ diceLoading: pendingDiceAssetLoads > 0 });
    },
  }));
}

const artisanStore = createArtisanStore();

/** Selects shared client state for the mounted Artisan application. */
export function useArtisanStore<T>(selector: (state: ArtisanState) => T): T {
  return useStore(artisanStore, selector);
}

export type { AssetURL, AssetURLs };
