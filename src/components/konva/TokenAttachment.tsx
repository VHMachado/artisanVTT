import { Circle, Group, Rect } from "react-konva";

import { attachmentHandleLayout } from "./konvaPresentation";

type TokenAttachmentProps = Readonly<{
  tokenHeight: number;
  dragging: boolean;
  highlight: boolean;
  radius: number;
}>;

function attachmentRingColor(highlight: boolean) {
  if (highlight) return "hsl(260, 100%, 80%)";
  return "rgba(255, 255, 255, 0.85)";
}

function TokenAttachment({ dragging, highlight, radius, tokenHeight }: TokenAttachmentProps) {
  const { grip, hitbox } = attachmentHandleLayout(tokenHeight, radius);
  const activeStroke = attachmentRingColor(highlight);
  const hitboxStyle = { cornerRadius: 2.5, fill: "transparent" };
  const gripStyle = { cornerRadius: 2.5, fill: "rgba(36, 39, 51, 0.8)" };
  const gripShadow = {
    shadowColor: "rgba(0, 0, 0, 0.5)",
    shadowOffset: { x: 0, y: radius / 40 },
    shadowBlur: radius / 15,
  };
  const ring = dragging ? (
    <Circle radius={radius} stroke={activeStroke} strokeWidth={0.5} />
  ) : null;

  return (
    <Group>
      <Rect name="attachment-hitbox" {...hitbox} {...hitboxStyle} />
      <Rect
        {...grip}
        {...gripStyle}
        {...gripShadow}
        hitFunc={() => {}}
      />
      {ring}
    </Group>
  );
}

export default TokenAttachment;
