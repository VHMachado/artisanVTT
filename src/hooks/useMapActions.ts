import { useCallback } from "react";
import { MapState } from "../types/MapState";
import {
  MapAction,
  MapActionHistory,
  useArtisanStore,
} from "../state/artisanStore";

export type { FogsAction, TokensAction, MapAction } from "../state/artisanStore";
export type MapActions = MapActionHistory;

export type AddActionsEventHandler = (actions: MapAction[]) => void;
export type UpdateActionIndexEventHandler = (change: number) => void;
export type ResetActionsEventHandler = () => void;

function applyMapActionsToState(
  mapState: MapState,
  actions: MapAction[]
): MapState {
  for (const mapAction of actions) {
    if (mapAction.type === "fogs") {
      mapState.fogs = mapAction.action.execute(mapState.fogs);
    } else if (mapAction.type === "tokens") {
      mapState.tokens = mapAction.action.execute(mapState.tokens);
    }
  }
  return mapState;
}

function undoMapActionsToState(
  mapState: MapState,
  actions: MapAction[]
): MapState {
  for (const mapAction of actions) {
    if (mapAction.type === "fogs") {
      mapState.fogs = mapAction.action.undo(mapState.fogs);
    } else if (mapAction.type === "tokens") {
      mapState.tokens = mapAction.action.undo(mapState.tokens);
    }
  }
  return mapState;
}

/**
 * Tracks a linear undo/redo history of actions applied to a map's state.
 * Each entry is a batch of `MapAction`s (applied/undone together), so a
 * single user gesture that touches multiple state slices still undoes as
 * one step.
 *
 * The history and its cursor live in the `artisanStore` mesa
 * slice (`addMapActionBatch`/`moveMapActionIndex`/`resetMapActionHistory`)
 * — this hook is now a thin adapter that folds the store's transitions
 * over the networked `MapState` through the `setCurrentMapState` setter
 * it is handed, exactly as before. The store never touches `MapState`
 * itself; it only ever reports which batches to apply or undo.
 */
function useMapActions(
  setCurrentMapState: React.Dispatch<React.SetStateAction<MapState | null>>
): [
  MapActions,
  AddActionsEventHandler,
  UpdateActionIndexEventHandler,
  ResetActionsEventHandler
] {
  const mapActions = useArtisanStore((state) => state.mapActionHistory);
  const addMapActionBatch = useArtisanStore((state) => state.addMapActionBatch);
  const moveMapActionIndex = useArtisanStore(
    (state) => state.moveMapActionIndex
  );
  const resetMapActionHistory = useArtisanStore(
    (state) => state.resetMapActionHistory
  );

  function addActions(actions: MapAction[]) {
    addMapActionBatch(actions);
    setCurrentMapState((prevMapState) => {
      if (!prevMapState) {
        return prevMapState;
      }
      return applyMapActionsToState({ ...prevMapState }, actions);
    });
  }

  function updateActionIndex(change: number) {
    const { direction, batches } = moveMapActionIndex(change);
    setCurrentMapState((prevMapState) => {
      if (!prevMapState) {
        return prevMapState;
      }
      let state = { ...prevMapState };
      for (const batch of batches) {
        state =
          direction === "apply"
            ? applyMapActionsToState(state, batch)
            : undoMapActionsToState(state, batch);
      }
      return state;
    });
  }

  const resetActions = useCallback(() => {
    resetMapActionHistory();
  }, [resetMapActionHistory]);

  return [mapActions, addActions, updateActionIndex, resetActions];
}

export default useMapActions;
