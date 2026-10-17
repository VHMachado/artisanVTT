import { useEffect, useRef } from "react";

import { useMapStage } from "../contexts/MapStageContext";
import {
  useStageWidth,
  useStageHeight,
  useMapWidth,
  useMapHeight,
  useSetStageScale,
} from "../contexts/MapInteractionContext";

import { toCameraState, toStagePosition, CameraLayout } from "../helpers/camera";

import Session from "./Session";
import { CameraState } from "../types/Camera";
import Vector2 from "../helpers/Vector2";

// Match the pointer tool, 20fps is plenty for a camera and keeps bandwidth low
const sendTickRate = 50;
// Ignore differences smaller than this so a still camera sends nothing
const positionEpsilon = 0.0005;
const scaleEpsilon = 0.001;
// Resend an unchanged camera at least this often, in milliseconds
const keyframeInterval = 1000;

type NetworkedMapCameraProps = {
  session: Session;
  /** True when this user is the one sharing their camera */
  broadcasting: boolean;
  /** True when this user should follow the shared camera */
  following: boolean;
};

/**
 * Shares the Game Master's camera with the party.
 *
 * Nothing is rendered, this only reads and writes the Konva stage transform.
 * Fog is unaffected: it is drawn per viewer from the map state, so a follower
 * sees the same framing but still only the parts of the map the Game Master
 * has revealed to them.
 */
function NetworkedMapCamera({
  session,
  broadcasting,
  following,
}: NetworkedMapCameraProps) {
  const mapStageRef = useMapStage();
  const stageWidth = useStageWidth();
  const stageHeight = useStageHeight();
  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const setStageScale = useSetStageScale();

  // Keep the latest layout in a ref so the send loop doesn't need to restart
  // every time the window resizes
  const layoutRef = useRef({ stageWidth, stageHeight, mapWidth, mapHeight });
  useEffect(() => {
    layoutRef.current = { stageWidth, stageHeight, mapWidth, mapHeight };
  }, [stageWidth, stageHeight, mapWidth, mapHeight]);

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const setStageScaleRef = useRef(setStageScale);
  useEffect(() => {
    setStageScaleRef.current = setStageScale;
  }, [setStageScale]);

  /** Current layout including the map layer's centring offset, or null if not ready */
  function getLayout(layerOffset: Vector2): CameraLayout | null {
    const { stageWidth, stageHeight, mapWidth, mapHeight } = layoutRef.current;
    if (!mapWidth || !mapHeight) {
      return null;
    }
    return { stageWidth, stageHeight, mapWidth, mapHeight, layerOffset };
  }

  // Broadcast our own camera while sharing is on
  useEffect(() => {
    if (!broadcasting) {
      return;
    }

    let request = requestAnimationFrame(update);
    let prevTime = performance.now();
    let counter = 0;
    let lastSent: CameraState | null = null;
    let sinceKeyframe = 0;

    function update(time: number) {
      request = requestAnimationFrame(update);
      counter += time - prevTime;
      prevTime = time;
      if (counter < sendTickRate) {
        return;
      }
      counter -= sendTickRate;
      sinceKeyframe += sendTickRate;

      const stage = mapStageRef.current;
      const socket = sessionRef.current?.socket;
      if (!stage || !socket) {
        return;
      }
      const layer = stage.getLayers()[0];
      const layout = getLayout(layer ? layer.position() : { x: 0, y: 0 });
      if (!layout) {
        return;
      }

      const camera = toCameraState(stage.position(), stage.scaleX(), layout);

      const unchanged =
        lastSent &&
        Math.abs(lastSent.x - camera.x) < positionEpsilon &&
        Math.abs(lastSent.y - camera.y) < positionEpsilon &&
        Math.abs(lastSent.scale - camera.scale) < scaleEpsilon;

      // Resend a still camera now and then, so a player who joins late or
      // misses a volatile packet still catches up instead of waiting for the
      // Game Master to move.
      if (unchanged && sinceKeyframe < keyframeInterval) {
        return;
      }
      sinceKeyframe = 0;
      lastSent = camera;
      socket.volatile.emit("player_camera", camera);
    }

    return () => cancelAnimationFrame(request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcasting, mapStageRef]);

  // Apply the shared camera while following
  useEffect(() => {
    if (!following) {
      return;
    }

    function handleCamera(camera: CameraState) {
      const stage = mapStageRef.current;
      if (!stage) {
        return;
      }
      const layer = stage.getLayers()[0];
      const layout = getLayout(layer ? layer.position() : { x: 0, y: 0 });
      if (!layout) {
        return;
      }

      stage.scale({ x: camera.scale, y: camera.scale });
      stage.position(toStagePosition(camera, layout));
      stage.draw();
      // Tools and the grid read the scale from React state, keep it in step
      setStageScaleRef.current(camera.scale);
    }

    // The socket is created asynchronously inside Session.connect, so it may
    // not exist yet on mount. Bind on every status change as well, otherwise
    // the listener is silently never attached.
    function bind() {
      session.socket?.off("player_camera", handleCamera);
      session.socket?.on("player_camera", handleCamera);
    }
    bind();
    session.on("status", bind);

    return () => {
      session.off("status", bind);
      session.socket?.off("player_camera", handleCamera);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following, session, mapStageRef]);

  return null;
}

export default NetworkedMapCamera;
