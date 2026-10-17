import Konva from "konva";
import { Rect, Circle, Line } from "react-konva";

import colors from "../../helpers/colors";
import { Outline } from "../../types/Outline";

type TokenOutlineProps = {
  outline: Outline;
  hidden: boolean;
} & Konva.ShapeConfig;

function TokenOutline({ outline, hidden, ...shapeProps }: TokenOutlineProps) {
  const appearance = { fill: colors.black, opacity: hidden ? 0 : 0.8 };

  switch (outline.type) {
    case "rect":
      return <Rect {...appearance} {...shapeProps} {...outline} />;
    case "circle":
      return <Circle {...appearance} {...shapeProps} {...outline} />;
    default:
      return (
        <Line
          {...appearance}
          {...shapeProps}
          points={outline.points}
          closed
          tension={outline.points.length < 200 ? 0 : 0.33}
        />
      );
  }
}

export default TokenOutline;
