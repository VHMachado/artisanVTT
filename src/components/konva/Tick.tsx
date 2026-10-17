import type Konva from "konva";
import { useState } from "react";
import { Circle, Group, Path } from "react-konva";

const glyphs = {
  accept: "M9 16.2l-3.5-3.5c-.39-.39-1.01-.39-1.4 0-.39.39-.39 1.01 0 1.4l4.19 4.19c.39.39 1.02.39 1.41 0L20.3 7.7c.39-.39.39-1.01 0-1.4-.39-.39-1.01-.39-1.4 0L9 16.2z",
  reject: "M18.3 5.71c-.39-.39-1.02-.39-1.41 0L12 10.59 7.11 5.7c-.39-.39-1.02-.39-1.41 0-.39.39-.39 1.02 0 1.41L10.59 12 5.7 16.89c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0L12 13.41l4.89 4.89c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z",
};

type TickProps = Readonly<{
  x: number;
  y: number;
  scale: number;
  cross: boolean;
  onClick: (event: Konva.KonvaEventObject<MouseEvent>) => void;
}>;

export function Tick({ cross, onClick, scale, x, y }: TickProps) {
  const [hovered, setHovered] = useState(false);
  const glyph = glyphs[cross ? "reject" : "accept"];
  const iconColor = hovered ? "hsl(260, 100%, 80%)" : "white";
  const markerPosition = { x, y };
  const markerScale = { x: scale, y: scale };
  const hoverHandlers = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  };
  const activationHandlers = {
    onClick,
    onTap: onClick,
  };
  return (
    <Group
      position={markerPosition}
      scale={markerScale}
      {...activationHandlers}
      {...hoverHandlers}
    >
      <Circle name={cross ? "cancel-polygon" : "accept-polygon"} fill="hsla(230, 25%, 18%, 0.8)" radius={12} />
      <Path
        data={glyph}
        offset={{ x: 12, y: 12 }}
        fill={iconColor}
      />
    </Group>
  );
}

export default Tick;
