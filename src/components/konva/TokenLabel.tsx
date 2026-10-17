import type Konva from "konva";
import { Group, Rect, Text } from "react-konva";
import { useEffect, useRef, useState } from "react";

import useSetting from "../../hooks/useSetting";
import type { TokenState } from "../../types/TokenState";
import { labelBoxPadding, labelFontScale } from "./konvaPresentation";

const sourceFontSize = 144;

type TokenLabelProps = Pick<TokenState, "label" | "size" | "visible"> & {
  width: number;
  height: number;
};

/** An upright, width-fitted caption that remains readable while its token rotates. */
function TokenLabel({ label, size, visible, width, height }: TokenLabelProps) {
  const [setting] = useSetting<number>("map.labelSize");
  const measureNode = useRef<Konva.Text>(null);
  const textNode = useRef<Konva.Text>(null);
  const { x: horizontalPadding, y: verticalPadding } = labelBoxPadding(height, size);
  const [scale, setScale] = useState(0);
  const [measuredTextWidth, setMeasuredTextWidth] = useState(0);

  useEffect(() => {
    const sizer = measureNode.current;
    if (!sizer) return;
    sizer.text(label);
    setScale(
      labelFontScale({
        height,
        tokenSize: size,
        setting,
        availableWidth: width,
        horizontalPadding,
        measure: (fontSize) => {
          sizer.fontSize(fontSize);
          return sizer.getTextWidth();
        },
      })
    );
  }, [height, horizontalPadding, label, setting, size, visible, width]);

  useEffect(() => {
    const node = textNode.current;
    setMeasuredTextWidth(label && node ? node.getTextWidth() * scale : 0);
  }, [label, scale]);

  const pillWidth = measuredTextWidth + horizontalPadding * 2;
  const pillHeight = sourceFontSize * scale + verticalPadding;
  return (
    <Group y={height - pillHeight / 2}>
      <Rect
        x={width - pillWidth / 2}
        y={-verticalPadding / 2}
        width={pillWidth}
        height={pillHeight}
        offsetX={width / 2}
        cornerRadius={pillHeight / 2}
        fill="hsla(230, 25%, 18%, 0.8)"
      />
      <Group offsetX={(measuredTextWidth - width) / 2}>
        <Text
          ref={textNode}
          text={label}
          fontSize={sourceFontSize}
          lineHeight={1}
          scale={{ x: scale, y: scale }}
          fill="white"
          wrap="none"
          ellipsis={false}
          hitFunc={() => {}}
        />
      </Group>
      <Text ref={measureNode} visible={false} text={label} wrap="none" />
    </Group>
  );
}

export default TokenLabel;
