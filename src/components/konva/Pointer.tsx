import Color from "color";
import Konva from "konva";
import { useCallback, useEffect, useRef } from "react";
import { Circle, Group, Line } from "react-konva";

import Vector2 from "../../helpers/Vector2";
import { trailPolygon } from "./konvaPresentation";

type TimedPoint = Vector2 & { remaining: number };
type PointerProps = Readonly<{ position: Vector2; size: number; duration?: number; segments?: number; color: string }>;

function fadedColor(color: string) {
  return Color(color).lighten(0.5).alpha(0).string();
}

function Pointer({ color, duration = 200, position, segments = 20, size }: PointerProps) {
  const line = useRef<Konva.Line>(null);
  const head = useRef<Konva.Circle>(null);
  const latestPosition = useRef(position);
  const previousSample = useRef(position);
  const samples = useRef<TimedPoint[]>([]);
  const trailEndColor = useRef(fadedColor(color));

  useEffect(() => {
    latestPosition.current = position;
    if (!Vector2.compare(position, previousSample.current, 0.0001)) {
      samples.current.push({ ...position, remaining: duration });
      previousSample.current = position;
    }
  }, [duration, position]);

  useEffect(() => {
    trailEndColor.current = fadedColor(color);
  }, [color]);

  useEffect(() => {
    let lastFrame = performance.now();
    let frame = 0;
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const elapsed = now - lastFrame;
      lastFrame = now;
      samples.current = samples.current
        .map((sample) => ({ ...sample, remaining: sample.remaining - elapsed }))
        .filter((sample) => sample.remaining >= 0);

      head.current?.position(latestPosition.current);
      if (samples.current.length > 0) line.current?.getLayer()?.draw();
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);

  const paintTrail = useCallback(
    (context: Konva.Context) => {
      const smoothPoints = Vector2.resample(samples.current, segments);
      const outline = trailPolygon(smoothPoints, size);
      if (outline.length === 0) return;

      context.beginPath();
      context.moveTo(outline[0].x, outline[0].y);
      outline.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.closePath();

      const origin = smoothPoints[smoothPoints.length - 1];
      const tail = smoothPoints[0];
      const radius = Vector2.distance(origin, tail);
      const gradient = context.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, trailEndColor.current);
      // Konva exposes its native context with a narrow type that omits fillStyle.
      (context as any).fillStyle = gradient;
      context.fill();
    },
    [color, segments, size]
  );

  return (
    <Group>
      <Line ref={line} sceneFunc={paintTrail} />
      <Circle ref={head} position={position} fill={color} width={size} height={size} />
    </Group>
  );
}

export default Pointer;
