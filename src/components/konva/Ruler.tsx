import { Group, Label, Line, Tag, Text } from "react-konva";

import { useGridStrokeWidth } from "../../contexts/GridContext";
import { useDebouncedStageScale, useMapHeight, useMapWidth } from "../../contexts/MapInteractionContext";
import { scaleAndFlattenPoints } from "../../helpers/konva";
import Vector2 from "../../helpers/Vector2";
import type { GridScale } from "../../types/Grid";
import { formatRulerReadout } from "./konvaPresentation";

type RulerProps = Readonly<{ points: Vector2[]; scale: GridScale; length: number }>;

function Ruler({ length, points, scale }: RulerProps) {
  const mapSize = { x: useMapWidth(), y: useMapHeight() };
  const canvasScale = useDebouncedStageScale();
  const stroke = useGridStrokeWidth();
  const center = Vector2.multiply(Vector2.centroid(points), mapSize);
  const commonLine = { points: scaleAndFlattenPoints(points, mapSize), lineCap: "round" as const };

  return (
    <Group>
      <Line {...commonLine} stroke="hsla(230, 25%, 18%, 0.8)" strokeWidth={stroke * 1.5} />
      <Line {...commonLine} stroke="white" strokeWidth={stroke / 4} />
      <Label
        x={center.x}
        y={center.y}
        offset={{ x: 26, y: 26 }}
        scale={{ x: 1 / canvasScale, y: 1 / canvasScale }}
      >
        <Tag cornerRadius={4} fill="hsla(230, 25%, 18%, 0.8)" />
        <Text padding={4} fontSize={24} fill="white" text={formatRulerReadout(length, scale)} />
      </Label>
    </Group>
  );
}

export default Ruler;
