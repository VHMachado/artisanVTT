import { describe, expect, it } from "vitest";

import Action from "../actions/Action";
import { createArtisanStore } from "./artisanStore";
import type { MapAction } from "./artisanStore";
import type { TokenStates } from "../types/TokenState";
import type { PlayerState } from "../types/PlayerState";
import type { PartyState } from "../types/PartyState";
import type { MapNpc } from "../types/MapNpc";

/** Minimal `Action<TokenStates>` that sets/removes one fixture entry,
 * standing in for the real `AddStatesAction`/`RemoveStatesAction` the
 * network layer actually dispatches — only the undo/redo plumbing is
 * under test here, not the action classes themselves. */
class ToggleTokenAction extends Action<TokenStates> {
  constructor(private readonly id: string, private readonly present: boolean) {
    super();
  }
  update(state: TokenStates): TokenStates {
    const next = { ...state };
    if (this.present) {
      next[this.id] = { id: this.id } as any;
    } else {
      delete next[this.id];
    }
    return next;
  }
}

describe("Artisan store", () => {
  it("keeps a game identity and its asset URL cache isolated from another mount", () => {
    const first = createArtisanStore();
    const second = createArtisanStore();

    first.getState().setUserId("gm-a");
    first.getState().replaceAssetURLs({
      map: { id: "map", url: "blob:map", references: 1 },
    });

    expect(first.getState().userId).toBe("gm-a");
    expect(first.getState().assetURLs.map.url).toBe("blob:map");
    expect(second.getState().userId).toBeUndefined();
    expect(second.getState().assetURLs).toEqual({});
  });

  it("derives the map index from the observed library snapshot", () => {
    const store = createArtisanStore();

    store.getState().replaceLibrary({
      maps: [{ id: "cavern" }] as any,
      mapStates: [{ mapId: "cavern" }] as any,
      mapGroups: [] as any,
      mapsLoading: false,
    });

    expect(store.getState().mapsById.cavern).toEqual({ id: "cavern" });
    expect(store.getState().mapStates).toEqual([{ mapId: "cavern" }]);
    expect(store.getState().mapsLoading).toBe(false);
  });

  it("holds observable state rather than Dexie or worker service dependencies", () => {
    const state = createArtisanStore().getState();

    expect(state).not.toHaveProperty("assetGateway");
    expect(state).not.toHaveProperty("getAsset");
    expect(state).not.toHaveProperty("putAsset");
  });
  it("projects the current map and which token entities are placed on it", () => {
    const store = createArtisanStore();

    expect(store.getState().currentMapId).toBeUndefined();
    expect(store.getState().isCurrentMapOwner).toBe(false);
    expect(store.getState().placedCharacterIds.size).toBe(0);
    expect(store.getState().placedNpcIds.size).toBe(0);

    store.getState().setCurrentMap("cavern", true);
    expect(store.getState().currentMapId).toBe("cavern");
    expect(store.getState().isCurrentMapOwner).toBe(true);

    store.getState().setPlacedTokenEntities(
      new Set(["char-1"]),
      new Set(["npc-1", "npc-2"])
    );
    expect(store.getState().placedCharacterIds).toEqual(new Set(["char-1"]));
    expect(store.getState().placedNpcIds).toEqual(
      new Set(["npc-1", "npc-2"])
    );
  });

  it("defaults the shelf to single-select with no open group or filter", () => {
    const state = createArtisanStore().getState();

    expect(state.shelfSelectMode).toBe("single");
    expect(state.openShelfGroupId).toBeUndefined();
    expect(state.shelfFilter).toBeUndefined();
    expect(state.selectedShelfGroupIds).toEqual([]);
  });

  it("opening or closing a shelf group clears the current selection", () => {
    const store = createArtisanStore();

    store.getState().selectShelfGroup("a", [{ id: "a" }, { id: "b" }]);
    expect(store.getState().selectedShelfGroupIds).toEqual(["a"]);

    store.getState().openShelfGroup("group-1");
    expect(store.getState().openShelfGroupId).toBe("group-1");
    expect(store.getState().selectedShelfGroupIds).toEqual([]);

    store.getState().selectShelfGroup("a", [{ id: "a" }, { id: "b" }]);
    store.getState().closeShelfGroup();
    expect(store.getState().openShelfGroupId).toBeUndefined();
    expect(store.getState().selectedShelfGroupIds).toEqual([]);
  });

  it("setting a non-empty shelf filter closes any open group", () => {
    const store = createArtisanStore();

    store.getState().openShelfGroup("group-1");
    store.getState().setShelfFilter("dragon");

    expect(store.getState().shelfFilter).toBe("dragon");
    expect(store.getState().openShelfGroupId).toBeUndefined();
  });

  it("clearing the shelf filter restores undefined, not an empty string", () => {
    const store = createArtisanStore();

    store.getState().setShelfFilter("dragon");
    store.getState().clearShelfFilter();

    expect(store.getState().shelfFilter).toBeUndefined();
  });

  it("resetting the shelf closes the group, clears filter/selection and the drag", () => {
    const store = createArtisanStore();

    store.getState().openShelfGroup("group-1");
    store.getState().setShelfFilter("dragon");
    store.getState().selectShelfGroup("a", [{ id: "a" }]);
    store.getState().startTileDrag("a");

    store.getState().resetShelf();

    expect(store.getState().openShelfGroupId).toBeUndefined();
    expect(store.getState().shelfFilter).toBeUndefined();
    expect(store.getState().selectedShelfGroupIds).toEqual([]);
    expect(store.getState().draggedTileId).toBeNull();
  });

  it("holds a mesa token selection that clears when the map changes", () => {
    const store = createArtisanStore();

    store.getState().setMapSelection({
      items: [{ type: "token", id: "a" }],
      x: 0,
      y: 0,
      data: { type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
    } as any);
    expect(store.getState().mapSelection?.items).toHaveLength(1);

    store.getState().clearMapSelection();
    expect(store.getState().mapSelection).toBeNull();
  });

  it("starts the mesa action history empty with no step to undo", () => {
    const state = createArtisanStore().getState();

    expect(state.mapActionHistory).toEqual({ actions: [], actionIndex: -1 });
  });

  it("appends a batch to the mesa action history and selects it as current", () => {
    const store = createArtisanStore();
    const batch: MapAction[] = [
      { type: "tokens", action: new ToggleTokenAction("a", true) },
    ];

    store.getState().addMapActionBatch(batch);

    expect(store.getState().mapActionHistory.actions).toEqual([batch]);
    expect(store.getState().mapActionHistory.actionIndex).toBe(0);
  });

  it("discards the abandoned redo tail when a batch is added after an undo", () => {
    const store = createArtisanStore();
    const first: MapAction[] = [
      { type: "tokens", action: new ToggleTokenAction("a", true) },
    ];
    const second: MapAction[] = [
      { type: "tokens", action: new ToggleTokenAction("b", true) },
    ];
    const third: MapAction[] = [
      { type: "tokens", action: new ToggleTokenAction("c", true) },
    ];

    store.getState().addMapActionBatch(first);
    store.getState().addMapActionBatch(second);
    store.getState().moveMapActionIndex(-1); // undo `second`, index -> 0
    store.getState().addMapActionBatch(third);

    expect(store.getState().mapActionHistory.actions).toEqual([first, third]);
    expect(store.getState().mapActionHistory.actionIndex).toBe(1);
  });

  it("moving the action index backward returns the batches to undo, in order", () => {
    const store = createArtisanStore();
    const first: MapAction[] = [
      { type: "tokens", action: new ToggleTokenAction("a", true) },
    ];
    const second: MapAction[] = [
      { type: "tokens", action: new ToggleTokenAction("b", true) },
    ];
    store.getState().addMapActionBatch(first);
    store.getState().addMapActionBatch(second);

    const transition = store.getState().moveMapActionIndex(-1);

    expect(transition).toEqual({ direction: "undo", batches: [second] });
    expect(store.getState().mapActionHistory.actionIndex).toBe(0);
  });

  it("moving the action index forward returns the batches to (re)apply, in order", () => {
    const store = createArtisanStore();
    const first: MapAction[] = [
      { type: "tokens", action: new ToggleTokenAction("a", true) },
    ];
    const second: MapAction[] = [
      { type: "tokens", action: new ToggleTokenAction("b", true) },
    ];
    store.getState().addMapActionBatch(first);
    store.getState().addMapActionBatch(second);
    store.getState().moveMapActionIndex(-2); // back to index -1

    const transition = store.getState().moveMapActionIndex(2);

    expect(transition).toEqual({ direction: "apply", batches: [first, second] });
    expect(store.getState().mapActionHistory.actionIndex).toBe(1);
  });

  it("clamps the action index at both ends of the history", () => {
    const store = createArtisanStore();
    const only: MapAction[] = [
      { type: "tokens", action: new ToggleTokenAction("a", true) },
    ];
    store.getState().addMapActionBatch(only);

    expect(store.getState().moveMapActionIndex(5)).toEqual({
      direction: "apply",
      batches: [],
    });
    expect(store.getState().mapActionHistory.actionIndex).toBe(0);

    store.getState().moveMapActionIndex(-5);
    expect(store.getState().mapActionHistory.actionIndex).toBe(-1);
    expect(store.getState().moveMapActionIndex(-5)).toEqual({
      direction: "undo",
      batches: [],
    });
  });

  it("resetting the mesa action history clears it to empty", () => {
    const store = createArtisanStore();
    store.getState().addMapActionBatch([
      { type: "tokens", action: new ToggleTokenAction("a", true) },
    ]);

    store.getState().resetMapActionHistory();

    expect(store.getState().mapActionHistory).toEqual({
      actions: [],
      actionIndex: -1,
    });
  });

  it("starts with no player snapshot published yet", () => {
    const state = createArtisanStore().getState();

    expect(state.playerState).toBeUndefined();
    expect(state.playerUpdater).toBeUndefined();
  });

  it("publishes the networked player snapshot and its setter for cross-tree reads", () => {
    const store = createArtisanStore();
    const snapshot: PlayerState = {
      nickname: "Aria",
      dice: { share: true, rolls: [] },
      sessionId: "sess-1",
      userId: "user-1",
      accountId: 7,
    };
    const updater = () => {};

    store.getState().publishPlayerState(snapshot, updater);

    expect(store.getState().playerState).toBe(snapshot);
    expect(store.getState().playerUpdater).toBe(updater);
  });

  it("starts with an empty party before PartyProvider publishes anything", () => {
    const state = createArtisanStore().getState();

    expect(state.partyState).toEqual({});
  });

  it("publishes the party roster (every OTHER connected player)", () => {
    const store = createArtisanStore();
    const party: PartyState = {
      "sess-2": {
        nickname: "Bram",
        dice: { share: false, rolls: [] },
        sessionId: "sess-2",
      },
    };

    store.getState().publishPartyState(party);

    expect(store.getState().partyState).toBe(party);
  });

  it("starts with an empty NPC roster before MapNpcsProvider publishes anything", () => {
    const state = createArtisanStore().getState();

    expect(state.mapNpcs).toEqual([]);
  });

  it("publishes the current map's NPC roster snapshot", () => {
    const store = createArtisanStore();
    const npcs: MapNpc[] = [
      { id: "npc-1", mapId: "cavern", monsterIndex: "goblin", createdAt: 1 },
    ];

    store.getState().publishMapNpcs(npcs);

    expect(store.getState().mapNpcs).toBe(npcs);
  });

  it("starts with no map assets loading", () => {
    const state = createArtisanStore().getState();

    expect(state.mapLoading.isLoading).toBe(false);
    expect(state.mapLoading.loadingProgressRef.current).toBe(0);
  });

  it("tracks per-asset load progress as the mean fraction complete, finishing at 1", () => {
    const store = createArtisanStore();

    store.getState().mapAssetLoadStart("asset-a");
    store.getState().mapAssetLoadStart("asset-b");
    expect(store.getState().mapLoading.isLoading).toBe(true);

    store.getState().mapAssetProgressUpdate({ id: "asset-a", count: 1, total: 1 });
    expect(store.getState().mapLoading.loadingProgressRef.current).toBe(0.5);
    expect(store.getState().mapLoading.isLoading).toBe(true);

    store.getState().mapAssetProgressUpdate({ id: "asset-b", count: 1, total: 1 });
    expect(store.getState().mapLoading.loadingProgressRef.current).toBe(1);
    expect(store.getState().mapLoading.isLoading).toBe(false);
  });

  it("starts with no dice meshes loading", () => {
    const state = createArtisanStore().getState();

    expect(state.diceLoading).toBe(false);
  });

  it("tracks concurrent dice asset loads, finishing only once every one completes", () => {
    const store = createArtisanStore();

    store.getState().diceAssetLoadStart();
    store.getState().diceAssetLoadStart();
    expect(store.getState().diceLoading).toBe(true);

    store.getState().diceAssetLoadFinish();
    expect(store.getState().diceLoading).toBe(true);

    store.getState().diceAssetLoadFinish();
    expect(store.getState().diceLoading).toBe(false);
  });

  it("never lets the dice loading count go negative", () => {
    const store = createArtisanStore();

    store.getState().diceAssetLoadFinish();
    expect(store.getState().diceLoading).toBe(false);
  });
});
