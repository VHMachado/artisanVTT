import { useEffect, useRef, useState } from "react";
import { Group } from "react-konva";

import PointerTool from "../components/tools/PointerTool";
import { useUserId } from "../contexts/UserIdContext";
import { Color } from "../helpers/colors";
import { MouseButtonBindings } from "../helpers/mouseBindings";
import { isEmpty } from "../helpers/shared";
import Vector2 from "../helpers/Vector2";
import useSetting from "../hooks/useSetting";
import { PointerState } from "../types/Pointer";
import Session from "./Session";

const POINTER_EVENT = "player_pointer";
const POINTER_SEND_INTERVAL = 50;
const POSITION_EPSILON = 0.0001;

type TimedPointer = PointerState & { time: number };

type PointerTransition = {
  id: string;
  from: TimedPointer | null;
  to: TimedPointer;
};

type NetworkedMapPointerProps = {
  session: Session;
  bindings: MouseButtonBindings;
};

function createPointer(
  id: string,
  position: Vector2,
  visible: boolean,
  color: Color
): PointerState {
  return { id, position, visible, color };
}

function positionOrVisibilityChanged(
  current: TimedPointer,
  received: PointerState
): boolean {
  return (
    !Vector2.compare(current.position, received.position, POSITION_EPSILON) ||
    current.visible !== received.visible
  );
}

function receivePointer(
  transitions: Record<string, PointerTransition>,
  pointer: PointerState,
  receivedAt: number
) {
  const previous = transitions[pointer.id];
  const arrivalTime = receivedAt + POINTER_SEND_INTERVAL;

  if (!previous) {
    transitions[pointer.id] = {
      id: pointer.id,
      from: null,
      to: { ...pointer, time: arrivalTime },
    };
    return;
  }

  if (!positionOrVisibilityChanged(previous.to, pointer)) {
    return;
  }

  transitions[pointer.id] = {
    id: pointer.id,
    from: { ...previous.to, time: receivedAt },
    to: { ...pointer, time: arrivalTime },
  };
}

function animationFrame(
  transitions: Record<string, PointerTransition>,
  now: number
): Record<string, PointerState> {
  const updates: Record<string, PointerState> = {};

  for (const transition of Object.values(transitions)) {
    if (!transition.from) {
      continue;
    }

    const elapsed = now - transition.from.time;
    const duration = transition.to.time - transition.from.time;
    const progress = elapsed / duration;

    if (progress >= 0 && progress <= 1) {
      updates[transition.id] = createPointer(
        transition.id,
        Vector2.lerp(
          transition.from.position,
          transition.to.position,
          progress
        ),
        transition.from.visible,
        transition.from.color
      );
    }

    if (progress > 1 && !transition.to.visible) {
      updates[transition.id] = createPointer(
        transition.id,
        transition.to.position,
        false,
        transition.to.color
      );
      delete transitions[transition.id];
    }
  }

  return updates;
}

function NetworkedMapPointer({
  session,
  bindings,
}: NetworkedMapPointerProps) {
  const userId = useUserId();
  const [pointerColor] = useSetting<Color>("pointer.color");
  const [pointers, setPointers] = useState<Record<string, PointerState>>({});
  const sessionRef = useRef(session);
  const pendingOwnPointer = useRef<PointerState | null>(null);
  const transitions = useRef<Record<string, PointerTransition>>({});

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    setPointers((current) => {
      if (current[userId]) {
        return current;
      }

      return {
        ...current,
        [userId]: createPointer(userId, { x: 0, y: 0 }, false, pointerColor),
      };
    });
  }, [pointerColor, userId]);

  useEffect(() => {
    let previousTime = performance.now();
    let accumulatedTime = 0;
    let requestId = 0;

    const sendPendingPointer = (now: number) => {
      requestId = requestAnimationFrame(sendPendingPointer);
      accumulatedTime += now - previousTime;
      previousTime = now;

      if (accumulatedTime <= POINTER_SEND_INTERVAL) {
        return;
      }

      accumulatedTime -= POINTER_SEND_INTERVAL;
      const pointer = pendingOwnPointer.current;
      const socket = sessionRef.current.socket;
      if (!pointer || !socket) {
        return;
      }

      socket.volatile.emit(POINTER_EVENT, pointer);
      pendingOwnPointer.current = null;
    };

    requestId = requestAnimationFrame(sendPendingPointer);
    return () => cancelAnimationFrame(requestId);
  }, []);

  useEffect(() => {
    const handlePointer = (pointer: PointerState) => {
      receivePointer(transitions.current, pointer, performance.now());
    };

    session.socket?.on(POINTER_EVENT, handlePointer);
    return () => {
      session.socket?.off(POINTER_EVENT, handlePointer);
    };
  }, [session]);

  useEffect(() => {
    let requestId = 0;

    const animatePointers = () => {
      requestId = requestAnimationFrame(animatePointers);
      const updates = animationFrame(transitions.current, performance.now());
      if (isEmpty(updates)) {
        return;
      }

      setPointers((current) => ({ ...current, ...updates }));
    };

    requestId = requestAnimationFrame(animatePointers);
    return () => cancelAnimationFrame(requestId);
  }, []);

  const updateOwnPointer = (position: Vector2, visible: boolean) => {
    if (!userId) {
      return;
    }

    const pointer = createPointer(userId, position, visible, pointerColor);
    setPointers((current) => ({ ...current, [userId]: pointer }));
    pendingOwnPointer.current = pointer;
  };

  const ownPointerHandlers = (position: Vector2) => updateOwnPointer(position, true);
  const hideOwnPointer = (position: Vector2) => updateOwnPointer(position, false);

  return (
    <Group>
      {Object.values(pointers).map((pointer) => {
        const belongsToCurrentUser = pointer.id === userId;
        return (
          <PointerTool
            key={pointer.id}
            bindings={bindings}
            position={pointer.position}
            visible={pointer.visible}
            color={pointer.color}
            onPointerDown={belongsToCurrentUser ? ownPointerHandlers : undefined}
            onPointerMove={belongsToCurrentUser ? ownPointerHandlers : undefined}
            onPointerUp={belongsToCurrentUser ? hideOwnPointer : undefined}
          />
        );
      })}
    </Group>
  );
}

export default NetworkedMapPointer;
