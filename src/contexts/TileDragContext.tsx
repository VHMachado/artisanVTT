import React from "react";
import {
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  RectEntry,
} from "@dnd-kit/core";
import { DragStartEvent, DragOverEvent, ViewRect } from "@dnd-kit/core";
import { DragCancelEvent } from "@dnd-kit/core/dist/types";

import DragContext, { CustomDragEndEvent } from "./DragContext";
import { useGroup } from "./GroupContext";

import { moveGroupsInto, moveGroups, ungroup } from "../helpers/group";
import Vector2 from "../helpers/Vector2";

import usePreventSelect from "../hooks/usePreventSelect";
import { GroupItem } from "../types/Group";

import { useArtisanStore } from "../state/artisanStore";

export const BASE_SORTABLE_ID = "__base__";
export const GROUP_SORTABLE_ID = "__group__";
export const GROUP_ID_PREFIX = "__group__";
export const UNGROUP_ID = "__ungroup__";
export const ADD_TO_MAP_ID = "__add__";

export function useTileDragId() {
  return useArtisanStore((state) => state.draggedTileId);
}

export function useTileOverGroupId() {
  return useArtisanStore((state) => state.hoveredTileGroupId);
}

export function useTileDragCursor() {
  return useArtisanStore((state) => state.tileDragCursor);
}

/** Whether the pointer sits inside any of the given rect entries, used by
 * `customCollisionDetection` to treat the add/ungroup drop zones as
 * either fully inside or fully outside (no partial-overlap collision). */
function pointIsWithinAnyRect(rects: RectEntry[], point: Vector2): boolean {
  return rects.some(([id, bounds]) => {
    if (!id || !bounds) {
      return false;
    }
    return (
      point.x > bounds.offsetLeft &&
      point.x < bounds.offsetLeft + bounds.width &&
      point.y > bounds.offsetTop &&
      point.y < bounds.offsetTop + bounds.height
    );
  });
}

/** Builds the three dnd-kit sensors (mouse/touch/keyboard) with this
 * app's activation tuning. Pulled out of the component body so the
 * magic numbers live next to a name instead of three separate
 * `useSensor` calls with inline option objects. */
function useTileDragSensors() {
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 3 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });
  const keyboardSensor = useSensor(KeyboardSensor);
  return useSensors(mouseSensor, touchSensor, keyboardSensor);
}

/** The group-shaped IDs `handleDragOver`/`handleDragEnd` key their branches
 * off of — pulled into one place so the five `over.id.startsWith(...)`
 * checks scattered through the old handlers read as named cases. */
function dropTargetKind(
  overId: string
): "group" | "ungroup" | "add" | "reorder" {
  if (overId.startsWith(GROUP_ID_PREFIX)) {
    return "group";
  }
  if (overId.startsWith(UNGROUP_ID)) {
    return "ungroup";
  }
  if (overId.startsWith(ADD_TO_MAP_ID)) {
    return "add";
  }
  return "reorder";
}

type TileDragProviderProps = {
  onDragAdd?: (selectedGroupIds: string[], rect: DOMRect) => void;
  onDragStart?: (event: DragStartEvent) => void;
  onDragEnd?: (event: CustomDragEndEvent) => void;
  onDragCancel?: (event: DragCancelEvent) => void;
  children?: React.ReactNode;
};

export function TileDragProvider(props: TileDragProviderProps) {
  const { onDragAdd, onDragStart, onDragCancel, onDragEnd, children } = props;
  const group = useGroup();
  const { groups, activeGroups, openGroupId, selectedGroupIds, filter } = group;

  const sensors = useTileDragSensors();
  const [preventSelect, resumeSelect] = usePreventSelect();

  const startTileDrag = useArtisanStore((state) => state.startTileDrag);
  const updateTileDragTarget = useArtisanStore(
    (state) => state.updateTileDragTarget
  );
  const finishTileDrag = useArtisanStore((state) => state.finishTileDrag);

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    startTileDrag(active.id);
    if (!selectedGroupIds.includes(active.id)) {
      group.onGroupSelect(active.id);
    }
    onDragStart?.(event);
    preventSelect();
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event;
    if (!over) {
      updateTileDragTarget(null, "grabbing");
      return;
    }

    switch (dropTargetKind(over.id)) {
      case "group":
        updateTileDragTarget(over.id.slice(GROUP_ID_PREFIX.length), "alias");
        break;
      case "ungroup":
        updateTileDragTarget(null, "alias");
        break;
      case "add":
        updateTileDragTarget(null, onDragAdd ? "copy" : "no-drop");
        break;
      case "reorder":
        updateTileDragTarget(null, "grabbing");
        break;
    }
  }

  /** `active`/`over` indices into `activeGroups`, sorted so a multi-select
   * drag keeps its members in their current relative order regardless of
   * which one the pointer actually grabbed. */
  function selectedIndicesInOrder(): number[] {
    return selectedGroupIds
      .map((groupId) => activeGroups.findIndex((item) => item.id === groupId))
      .sort((a, b) => a - b);
  }

  function dropOntoGroup(overId: string, activeId: string) {
    group.onClearSelection();
    if (overId === activeId) {
      return;
    }
    const overGroupIndex = activeGroups.findIndex((item) => item.id === overId);
    const newGroups = moveGroupsInto(
      activeGroups,
      overGroupIndex,
      selectedIndicesInOrder()
    );
    if (!openGroupId) {
      group.onGroupsChange(newGroups);
    }
  }

  function dropOntoUngroup() {
    if (!openGroupId) {
      return;
    }
    group.onClearSelection();
    group.onGroupsChange(ungroup(groups, openGroupId, selectedIndicesInOrder()));
  }

  function dropOntoAddToMap(overlayNodeClientRect: DOMRect | undefined) {
    if (onDragAdd && overlayNodeClientRect) {
      onDragAdd(selectedGroupIds, overlayNodeClientRect);
    }
  }

  function reorderTiles(overId: string) {
    if (filter) {
      // Reordering is disabled while a search filter narrows what's shown.
      return;
    }
    const overGroupIndex = activeGroups.findIndex((item) => item.id === overId);
    const newGroups = moveGroups(activeGroups, overGroupIndex, selectedIndicesInOrder());
    if (openGroupId) {
      group.onSubgroupChange(newGroups as GroupItem[], openGroupId);
    } else {
      group.onGroupsChange(newGroups);
    }
  }

  function handleDragEnd(event: CustomDragEndEvent) {
    const { active, over, overlayNodeClientRect } = event;
    finishTileDrag();

    if (active && over && active.id !== over.id) {
      switch (dropTargetKind(over.id)) {
        case "group":
          dropOntoGroup(over.id.slice(GROUP_ID_PREFIX.length), active.id);
          break;
        case "ungroup":
          dropOntoUngroup();
          break;
        case "add":
          dropOntoAddToMap(overlayNodeClientRect);
          break;
        case "reorder":
          reorderTiles(over.id);
          break;
      }
    }

    resumeSelect();
    onDragEnd?.(event);
  }

  function handleDragCancel(event: DragCancelEvent) {
    finishTileDrag();
    resumeSelect();
    onDragCancel?.(event);
  }

  /**
   * The add-to-map and ungroup drop zones sit at the edges of the shelf
   * and should "win" a collision the moment the dragged tile's center
   * leaves every other rect, rather than needing to overlap them
   * directly — so they're checked first, outside dnd-kit's normal
   * closest-center scoring, which only runs over what's left.
   */
  function customCollisionDetection(rects: RectEntry[], rect: ViewRect) {
    const rectCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };

    const addRect = rects.find(([id]) => id === ADD_TO_MAP_ID);
    if (addRect && !pointIsWithinAnyRect([addRect], rectCenter)) {
      return ADD_TO_MAP_ID;
    }

    if (openGroupId) {
      const ungroupRect = rects.find(([id]) => id === UNGROUP_ID);
      if (ungroupRect && !pointIsWithinAnyRect([ungroupRect], rectCenter)) {
        return UNGROUP_ID;
      }
    }

    const reorderableRects = rects.filter(
      ([id]) => id !== ADD_TO_MAP_ID && id !== UNGROUP_ID
    );
    return closestCenter(reorderableRects, rect);
  }

  return (
    <DragContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragCancel={handleDragCancel}
      sensors={sensors}
      collisionDetection={customCollisionDetection}
    >
      {children}
    </DragContext>
  );
}
