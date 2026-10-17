import { Circle, Group } from "react-konva";

import colors, { type Color } from "../../helpers/colors";
import { TokenState } from "../../types/TokenState";

type TokenStatusProps = {
  tokenState: TokenState;
  width: number;
  height: number;
};

function dedupeStatuses(tokenState: TokenState): string[] {
  return Array.from(new Set(tokenState.statuses.filter(Boolean)));
}

function statusRing(
  status: string,
  index: number,
  width: number,
  height: number,
  ringWidth: number,
  size: number
) {
  const scale = 1 - index / 10 / size;
  return (
    <Circle
      key={status}
      width={width}
      height={height}
      stroke={colors[status as Color]}
      strokeWidth={ringWidth}
      scaleX={scale}
      scaleY={scale}
      opacity={0.8}
      fillEnabled={false}
    />
  );
}

export default function TokenStatus(props: TokenStatusProps) {
  const { tokenState, width, height } = props;
  const statuses = dedupeStatuses(tokenState);
  const ringWidth = width / 20 / tokenState.size;

  return (
    <Group x={width} y={height} offsetX={width / 2} offsetY={height / 2}>
      {statuses.map((status, index) =>
        statusRing(status, index, width, height, ringWidth, tokenState.size)
      )}
    </Group>
  );
}
