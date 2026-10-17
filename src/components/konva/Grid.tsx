import { Group, Rect } from "react-konva";
import useImage from "use-image";

import Vector2 from "../../helpers/Vector2";
import hexPatternDark from "../../images/HexPatternDark.png";
import hexPatternLight from "../../images/HexPatternLight.png";
import squarePatternDark from "../../images/SquarePatternDark.png";
import squarePatternLight from "../../images/SquarePatternLight.png";

import {
  useGrid,
  useGridCellPixelSize,
  useGridOffset,
  useGridPixelSize,
} from "../../contexts/GridContext";

// Source DPI of each tiling pattern image, used to scale the pattern so a
// single tile lines up exactly with one grid cell.
const HEX_PATTERN_DPI = 153;
const SQUARE_PATTERN_DPI = 300;

type GridProps = { stroke?: "black" | "white" };
type CellPixelSize = ReturnType<typeof useGridCellPixelSize>;

function squarePatternProps(cellSize: CellPixelSize): Record<string, number> {
  const scale = cellSize.width / SQUARE_PATTERN_DPI;
  if (!(scale > 0)) return {};
  return {
    fillPatternScaleX: scale,
    fillPatternScaleY: scale,
    fillPatternOffsetX: cellSize.width / scale / 2,
    fillPatternOffsetY: cellSize.height / scale / 2,
  };
}

function hexVerticalPatternProps(cellSize: CellPixelSize): Record<string, number> {
  const scale = cellSize.width / HEX_PATTERN_DPI;
  if (!(scale > 0)) return {};
  return {
    fillPatternScaleX: scale,
    fillPatternScaleY: scale,
    fillPatternOffsetY: cellSize.radius / scale / 2,
  };
}

function hexHorizontalPatternProps(cellSize: CellPixelSize): Record<string, number> {
  const scale = cellSize.height / HEX_PATTERN_DPI;
  if (!(scale > 0)) return {};
  return {
    fillPatternScaleX: scale,
    fillPatternScaleY: scale,
    fillPatternOffsetY: -cellSize.radius / scale / 2,
    fillPatternRotation: 90,
  };
}

function patternPropsFor(
  gridType: string,
  cellSize: CellPixelSize
): Record<string, number> {
  switch (gridType) {
    case "square":
      return squarePatternProps(cellSize);
    case "hexVertical":
      return hexVerticalPatternProps(cellSize);
    case "hexHorizontal":
      return hexHorizontalPatternProps(cellSize);
    default:
      return {};
  }
}

/**
 * Renders the grid as a tiled, repeating pattern rather than drawn lines so
 * it scales with the stage without re-rasterizing.
 */
export default function Grid({ stroke = "white" }: GridProps) {
  const grid = useGrid();
  const gridPixelSize = useGridPixelSize();
  const gridOffset = useGridOffset();
  const gridCellPixelSize = useGridCellPixelSize();

  const isHex = grid.type !== "square";
  const isDarkStroke = stroke === "black";
  const patternSource = isHex
    ? isDarkStroke
      ? hexPatternDark
      : hexPatternLight
    : isDarkStroke
    ? squarePatternDark
    : squarePatternLight;
  const [patternImage] = useImage(patternSource);

  if (!grid?.size.x || !grid?.size.y) {
    return null;
  }

  const offset = Vector2.multiply(gridOffset, -1);
  const patternProps = patternPropsFor(grid.type, gridCellPixelSize);

  return (
    <Group>
      <Rect
        width={gridPixelSize.width}
        height={gridPixelSize.height}
        offset={offset}
        fillPatternImage={patternImage}
        fillPatternRepeat="repeat"
        opacity={isDarkStroke ? 0.8 : 0.4}
        {...patternProps}
      />
    </Group>
  );
}
