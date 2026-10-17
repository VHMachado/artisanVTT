import { useEffect, useRef } from "react";
import { Group } from "react-konva";

import { useGridStrokeWidth } from "../../contexts/GridContext";
import { MapDragEvent, useInteractionEmitter, useMapHeight, useMapWidth } from "../../contexts/MapInteractionContext";
import { useMapStage } from "../../contexts/MapStageContext";
import colors, { Color } from "../../helpers/colors";
import { getRelativePointerPositionNormalized } from "../../helpers/konva";
import { isToolBound, MouseButtonBindings, toolForAnyButtonEvent } from "../../helpers/mouseBindings";
import Vector2 from "../../helpers/Vector2";
import Pointer from "../konva/Pointer";

type MapPointerProps = {
  bindings: MouseButtonBindings;
  position: Vector2;
  onPointerDown?: (position: Vector2) => void;
  onPointerMove?: (position: Vector2) => void;
  onPointerUp?: (position: Vector2) => void;
  visible: boolean;
  color: Color;
};

type PointerCallbacks = Pick<MapPointerProps, "onPointerDown" | "onPointerMove" | "onPointerUp">;

function usePointerGestures(bindings: MouseButtonBindings, enabled: boolean, visible: boolean, callbacks: PointerCallbacks) {
  const emitter = useInteractionEmitter();
  const stageRef = useMapStage();
  const pressed = useRef(false);

  useEffect(() => {
    const stage = stageRef.current;
    const pointerPosition = () => {
      const image = stage?.findOne("#mapImage");
      return image ? getRelativePointerPositionNormalized(image) : undefined;
    };
    const begin = (event: MapDragEvent) => {
      if (!enabled || toolForAnyButtonEvent(event, bindings) !== "pointer") return;
      const position = pointerPosition();
      if (position) callbacks.onPointerDown?.(position);
      pressed.current = true;
    };
    const update = () => {
      if (!pressed.current || !visible) return;
      const position = pointerPosition();
      if (position) callbacks.onPointerMove?.(position);
    };
    const finish = () => {
      if (!pressed.current) return;
      const position = pointerPosition();
      if (position) callbacks.onPointerUp?.(position);
      pressed.current = false;
    };

    emitter?.on("dragStart", begin);
    emitter?.on("drag", update);
    emitter?.on("dragEnd", finish);
    return () => {
      emitter?.off("dragStart", begin);
      emitter?.off("drag", update);
      emitter?.off("dragEnd", finish);
    };
  });
}

function PointerTrail({ color, position, visible }: Pick<MapPointerProps, "color" | "position" | "visible">) {
  const mapSize = { x: useMapWidth(), y: useMapHeight() };
  const diameter = useGridStrokeWidth() * 2;
  if (!visible) return null;
  return <Pointer position={Vector2.multiply(position, mapSize)} color={colors[color]} size={diameter} duration={200} />;
}

function PointerTool(props: MapPointerProps) {
  const enabled = isToolBound("pointer", props.bindings);
  usePointerGestures(props.bindings, enabled, props.visible, props);

  return <Group><PointerTrail color={props.color} position={props.position} visible={props.visible} /></Group>;
}

PointerTool.defaultProps = { color: "red" };

export default PointerTool;
