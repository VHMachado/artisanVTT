import { useCallback, useEffect, useRef, useState } from "react";
import { useToasts } from "react-toast-notifications";

import Action from "../actions/Action";
import {
  AddStatesAction,
  EditStatesAction,
  RemoveStatesAction,
} from "../actions";
import GlobalImageDrop from "../components/image/GlobalImageDrop";
import Map from "../components/map/Map";
import { useAssets } from "../contexts/AssetsContext";
import { useCurrentMap } from "../contexts/CurrentMapContext";
import { useDatabase } from "../contexts/DatabaseContext";
import { useMapData } from "../contexts/MapDataContext";
import { useMapLoading } from "../contexts/MapLoadingContext";
import { useParty } from "../contexts/PartyContext";
import type { MapTokenCreateRef } from "../contexts/MapTokenCreateContext";
import { useUserId } from "../contexts/UserIdContext";
import useDebounce from "../hooks/useDebounce";
import useMapActions from "../hooks/useMapActions";
import useNetworkedState from "../hooks/useNetworkedState";
import Session, { PeerDataEvent } from "./Session";
import type { DataProgressEvent } from "./Session";
import {
  AssetManifest,
  AssetManifestAsset,
  AssetManifestAssets,
} from "../types/Asset";
import { FogState } from "../types/Fog";
import { Map as MapType } from "../types/Map";
import { MapDarkness, MapState } from "../types/MapState";
import { TokenState } from "../types/TokenState";

type NetworkedMapAndTokensProps = {
  session: Session;
  mapTokenCreateRef?: MapTokenCreateRef;
  /** The Mesa id used by map-owned homebrew lookups. */
  gameId: string;
};

type PlacedTokenEntities = {
  characterIds: Set<string>;
  npcIds: Set<string>;
};

type AssetRequestWork = {
  manifest: AssetManifest;
  userId: string;
  partyState: ReturnType<typeof useParty>;
  requestingAssetIds: Set<string>;
  getAsset: ReturnType<typeof useAssets>["getAsset"];
  startLoading: ReturnType<typeof useMapLoading>["assetLoadStart"];
  requestAsset: (sessionId: string, asset: AssetManifestAsset) => void;
  reportMissingOwner: () => void;
};

function addManifestAsset(
  assets: AssetManifestAssets,
  asset: AssetManifestAsset
) {
  assets[asset.id] = asset;
}

function createMapAssetManifest(map: MapType, state: MapState): AssetManifest {
  const assets: AssetManifestAssets = {};
  const includedTokenFiles = new Set<string>();

  for (const token of Object.values(state.tokens)) {
    if (token.type !== "file" || includedTokenFiles.has(token.file)) {
      continue;
    }
    includedTokenFiles.add(token.file);
    addManifestAsset(assets, { id: token.file, owner: token.owner });
  }

  if (map.type === "file") {
    addManifestAsset(assets, { id: map.thumbnail, owner: map.owner });
    const mapImageId =
      map.quality === "original" ? map.file : map.resolutions[map.quality];
    if (mapImageId) {
      addManifestAsset(assets, { id: mapImageId, owner: map.owner });
    }
  }

  return { mapId: map.id, assets };
}

function mergeManifestAssets(
  manifest: AssetManifest | null,
  additions: AssetManifestAsset[]
): AssetManifest | null {
  if (!manifest?.assets) {
    return manifest;
  }

  const assets = { ...manifest.assets };
  for (const asset of additions) {
    if (!(asset.id in assets)) {
      addManifestAsset(assets, asset);
    }
  }
  return { ...manifest, assets };
}

function assetsForNewTokens(tokens: TokenState[]): AssetManifestAsset[] {
  const assets: AssetManifestAsset[] = [];
  for (const token of tokens) {
    if (token.type === "file") {
      assets.push({ id: token.file, owner: token.owner });
    }
  }
  return assets;
}

async function queueUnavailableAssets({
  manifest,
  userId,
  partyState,
  requestingAssetIds,
  getAsset,
  startLoading,
  requestAsset,
  reportMissingOwner,
}: AssetRequestWork) {
  for (const asset of Object.values(manifest.assets)) {
    if (asset.owner === userId || requestingAssetIds.has(asset.id)) {
      continue;
    }

    const owner = Object.values(partyState).find(
      (player) => player.userId === asset.owner
    );
    requestingAssetIds.add(asset.id);

    const cachedAsset = await getAsset(asset.id);
    if (!owner) {
      if (!cachedAsset) {
        reportMissingOwner();
      }
      requestingAssetIds.delete(asset.id);
      continue;
    }

    if (cachedAsset) {
      requestingAssetIds.delete(asset.id);
    } else if (owner.sessionId) {
      startLoading(asset.id);
      requestAsset(owner.sessionId, asset);
    }
  }
}

function projectPlacedTokenEntities(
  state: MapState | null
): PlacedTokenEntities {
  const characterIds = new Set<string>();
  const npcIds = new Set<string>();

  if (!state) {
    return { characterIds, npcIds };
  }

  for (const token of Object.values(state.tokens)) {
    if (token.characterId) {
      characterIds.add(token.characterId);
    }
    if (token.npcId) {
      npcIds.add(token.npcId);
    }
  }
  return { characterIds, npcIds };
}

function normalizeTokenEdits(
  changes: Record<string, Partial<TokenState>>
): Partial<TokenState>[] {
  const edits: Partial<TokenState>[] = [];
  for (const id in changes) {
    edits.push({ ...changes[id], id });
  }
  return edits;
}

function respondToAssetMessage(
  event: PeerDataEvent,
  getAsset: ReturnType<typeof useAssets>["getAsset"],
  putAsset: ReturnType<typeof useAssets>["putAsset"],
  requestingAssetIds: Set<string>
) {
  return (async () => {
    if (event.id === "assetRequest") {
      const asset = await getAsset(event.data.id);
      if (asset) {
        event.reply("assetResponseSuccess", asset, event.data.id);
      } else {
        event.reply("assetResponseFail", event.data.id, event.data.id);
      }
    }

    if (event.id === "assetResponseSuccess") {
      const asset = event.data;
      await putAsset(asset);
      requestingAssetIds.delete(asset.id);
    }

    if (event.id === "assetResponseFail") {
      requestingAssetIds.delete(event.data);
    }
  })();
}

function bindSessionListeners(
  session: Session,
  onPeerData: (event: PeerDataEvent) => Promise<void>,
  onProgress: (event: DataProgressEvent) => void,
  onMap: (map?: MapType) => Promise<void>
) {
  const socket = session.socket;
  session.on("peerData", onPeerData);
  session.on("peerDataProgress", onProgress);
  socket?.on("map", onMap);

  return () => {
    session.off("peerData", onPeerData);
    session.off("peerDataProgress", onProgress);
    session.socket?.off("map", onMap);
  };
}

function publishTokenCreateHandler(
  ref: MapTokenCreateRef | undefined,
  createTokens: (tokenStates: TokenState[]) => Promise<void>
) {
  if (ref) {
    ref.current = createTokens;
  }
}

function NetworkedMapAndTokens({
  session,
  mapTokenCreateRef,
  gameId,
}: NetworkedMapAndTokensProps) {
  const { addToast } = useToasts();
  const userId = useUserId();
  const partyState = useParty();
  const { assetLoadStart, assetProgressUpdate, isLoading } = useMapLoading();
  const { updateMapState } = useMapData();
  const { getAsset, putAsset } = useAssets();
  const { setCurrentMap: setCurrentMapContext, setPlacedTokenEntities } =
    useCurrentMap();
  const { database } = useDatabase();

  const [currentMap, setCurrentMap] = useState<MapType | null>(null);
  const [currentMapState, setCurrentMapState] = useNetworkedState<
    MapState | null
  >(null, session, "map_state", 500, true, "mapId", true);
  const [assetManifest, setAssetManifest] = useNetworkedState<
    AssetManifest | null
  >(null, session, "manifest", 500, true, "mapId", true);
  const requestingAssetsRef = useRef(new Set<string>());
  const previousMapIdRef = useRef<string>();

  const publishMapManifest = useCallback(
    (map: MapType, state: MapState) => {
      setAssetManifest(createMapAssetManifest(map, state), true, true);
    },
    [setAssetManifest]
  );

  const addAssetsIfNeeded = useCallback(
    (assets: AssetManifestAsset[]) => {
      setAssetManifest((manifest) => mergeManifestAssets(manifest, assets));
    },
    [setAssetManifest]
  );

  useEffect(() => {
    if (!assetManifest || !userId) {
      return;
    }

    queueUnavailableAssets({
      manifest: assetManifest,
      userId,
      partyState,
      requestingAssetIds: requestingAssetsRef.current,
      getAsset,
      startLoading: assetLoadStart,
      requestAsset: (sessionId, asset) =>
        session.sendTo(sessionId, "assetRequest", asset),
      reportMissingOwner: () => addToast("Unable to find owner for asset"),
    });
  }, [
    assetManifest,
    partyState,
    session,
    userId,
    addToast,
    getAsset,
    assetLoadStart,
  ]);

  const debouncedMapState = useDebounce(currentMapState, 500);
  useEffect(() => {
    if (
      debouncedMapState &&
      debouncedMapState.mapId &&
      currentMap &&
      currentMap.owner === userId &&
      database
    ) {
      updateMapState(debouncedMapState.mapId, debouncedMapState);
    }
  }, [currentMap, debouncedMapState, userId, database, updateMapState]);

  const handleMapChange = useCallback(
    async (newMap: MapType | null, newMapState: MapState | null) => {
      setCurrentMap(null);
      session.socket?.emit("map", null);
      setCurrentMapState(newMapState, true, true);
      setCurrentMap(newMap);
      session.socket?.emit("map", newMap);

      if (!newMap || !newMapState) {
        setAssetManifest(null, true, true);
        return;
      }
      await publishMapManifest(newMap, newMapState);
    },
    [publishMapManifest, session, setAssetManifest, setCurrentMapState]
  );

  const [mapActions, addActions, updateActionIndex, resetActions] =
    useMapActions(setCurrentMapState);

  const handleMapReset = useCallback(
    (newMapState: MapState) => {
      setCurrentMapState(newMapState, true, true);
      resetActions();
    },
    [resetActions, setCurrentMapState]
  );

  const handleFogDraw = useCallback(
    (action: Action<FogState>) => addActions([{ type: "fogs", action }]),
    [addActions]
  );
  const handleUndo = useCallback(() => updateActionIndex(-1), [updateActionIndex]);
  const handleRedo = useCallback(() => updateActionIndex(1), [updateActionIndex]);

  useEffect(() => {
    if (currentMap && currentMap.id !== previousMapIdRef.current) {
      resetActions();
      previousMapIdRef.current = currentMap.id;
    }
  }, [currentMap, resetActions]);

  useEffect(() => {
    setCurrentMapContext(
      currentMap?.id,
      Boolean(currentMap && currentMap.owner === userId)
    );
  }, [currentMap, userId, setCurrentMapContext]);

  useEffect(() => {
    const { characterIds, npcIds } = projectPlacedTokenEntities(currentMapState);
    setPlacedTokenEntities(characterIds, npcIds);
  }, [currentMapState, setPlacedTokenEntities]);

  const handleMapTokensStateCreate = useCallback(
    async (tokenStates: TokenState[]) => {
      if (!currentMap || !currentMapState) {
        return;
      }

      const assets = assetsForNewTokens(tokenStates);
      if (assets.length > 0) {
        addAssetsIfNeeded(assets);
      }
      addActions([{ type: "tokens", action: new AddStatesAction(tokenStates) }]);
    },
    [addActions, addAssetsIfNeeded, currentMap, currentMapState]
  );

  const addTokenEdits = useCallback(
    (changes: Record<string, Partial<TokenState>>) => {
      addActions([
        {
          type: "tokens",
          action: new EditStatesAction(normalizeTokenEdits(changes)),
        },
      ]);
    },
    [addActions]
  );

  const handleMapTokenStateChange = useCallback(
    (changes: Record<string, Partial<TokenState>>) => addTokenEdits(changes),
    [addTokenEdits]
  );

  const handleMapTokenStateRemove = useCallback(
    (tokenStateIds: string[]) => {
      addActions([
        { type: "tokens", action: new RemoveStatesAction<TokenState>(tokenStateIds) },
      ]);
    },
    [addActions]
  );

  const handleMapDarknessChange = useCallback(
    (darkness: MapDarkness) => {
      setCurrentMapState((state) => (state ? { ...state, darkness } : state));
    },
    [setCurrentMapState]
  );

  const handleSelectionItemsChange = useCallback(
    (changes: Record<string, Partial<TokenState>>) => addTokenEdits(changes),
    [addTokenEdits]
  );

  const handleSelectionItemsRemove = useCallback(
    (tokenStateIds: string[]) => {
      addActions([
        { type: "tokens", action: new RemoveStatesAction<TokenState>(tokenStateIds) },
      ]);
    },
    [addActions]
  );

  const handleSelectionItemsCreate = useCallback(
    (tokenStates: TokenState[]) => {
      addActions([{ type: "tokens", action: new AddStatesAction(tokenStates) }]);
    },
    [addActions]
  );

  const handlePeerData = useCallback(
    (event: PeerDataEvent) =>
      respondToAssetMessage(event, getAsset, putAsset, requestingAssetsRef.current),
    [getAsset, putAsset]
  );

  const handlePeerDataProgress = useCallback(
    ({ id, total, count }: DataProgressEvent) => {
      assetProgressUpdate({ id, total, count });
    },
    [assetProgressUpdate]
  );

  const handleSocketMap = useCallback(async (map?: MapType) => {
    setCurrentMap(map || null);
  }, []);

  // This intentionally has no dependency array: the legacy listener lifecycle
  // rebinds after every render, which keeps the Session wiring observable order.
  useEffect(() =>
    bindSessionListeners(
      session,
      handlePeerData,
      handlePeerDataProgress,
      handleSocketMap
    )
  );

  const canChangeMap = !isLoading;
  const mapProps = {
    tableId: gameId,
    onRedo: handleRedo,
    onUndo: handleUndo,
    session,
    allowMapChange: canChangeMap,
    onMapDarknessChange: handleMapDarknessChange,
    onFogDraw: handleFogDraw,
    onMapReset: handleMapReset,
    onMapChange: handleMapChange,
    onSelectionItemsCreate: handleSelectionItemsCreate,
    onSelectionItemsRemove: handleSelectionItemsRemove,
    onSelectionItemsChange: handleSelectionItemsChange,
    onMapTokensStateCreate: handleMapTokensStateCreate,
    onMapTokenStateRemove: handleMapTokenStateRemove,
    onMapTokenStateChange: handleMapTokenStateChange,
    mapActions,
    mapState: currentMapState,
    map: currentMap,
  };

  // Preserve assignment on each committed render so imperative callers always
  // receive the same render's token-create closure.
  useEffect(() => {
    publishTokenCreateHandler(mapTokenCreateRef, handleMapTokensStateCreate);
  });

  return (
    <GlobalImageDrop
      onMapChange={handleMapChange}
      onMapTokensStateCreate={handleMapTokensStateCreate}
      tableId={gameId}
    >
      <Map {...mapProps} />
    </GlobalImageDrop>
  );
}

export default NetworkedMapAndTokens;
