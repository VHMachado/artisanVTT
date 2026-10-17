import { useState } from "react";
import { Box, Slider as ThemeSlider, SliderProps } from "theme-ui";

type SliderModalProps = SliderProps & {
  min?: number;
  max?: number;
  value?: number;
  labelFunc?: (value: number) => string | number;
};

function percentOf(value: number, min: number, max: number) {
  const range = max - min;
  return range === 0 ? 0 : ((value - min) * 100) / range;
}

function labelOffset(percentValue: number) {
  return `calc(${percentValue}% + ${-8 - percentValue * 0.15}px)`;
}

function SliderLabel({
  percentValue,
  text,
}: {
  percentValue: number;
  text: string | number;
}) {
  return (
    <Box sx={{ position: "absolute", top: "-42px" }} style={{ left: labelOffset(percentValue) }}>
      <Box
        bg="primary"
        sx={{
          alignItems: "center",
          borderRadius: "50% 50% 50% 0%",
          display: "flex",
          height: "32px",
          justifyContent: "center",
          transform: "rotate(-45deg)",
          width: "32px",
        }}
      >
        <Box
          sx={{
            fontFamily: "body2",
            fontSize: 0,
            fontWeight: "caption",
            transform: "rotate(45deg)",
          }}
        >
          {text}
        </Box>
      </Box>
    </Box>
  );
}

function withLabelToggle<Event>(
  reveal: boolean,
  setRevealed: (next: boolean) => void,
  forward?: (event: Event) => void
) {
  return (event: Event) => {
    setRevealed(reveal);
    forward?.(event);
  };
}

function Slider({
  min = 0,
  max = 1,
  value = 0,
  ml = 0,
  mr = 0,
  labelFunc = (current: number) => current,
  onMouseDown,
  onMouseUp,
  onTouchStart,
  onTouchEnd,
  ...rest
}: SliderModalProps) {
  const [labelVisible, setLabelVisible] = useState(false);

  return (
    <Box ml={ml} mr={mr} sx={{ position: "relative" }}>
      {labelVisible && (
        <SliderLabel percentValue={percentOf(value, min, max)} text={labelFunc(value)} />
      )}
      <ThemeSlider
        max={max}
        min={min}
        onMouseDown={withLabelToggle(true, setLabelVisible, onMouseDown)}
        onMouseUp={withLabelToggle(false, setLabelVisible, onMouseUp)}
        onTouchEnd={withLabelToggle(false, setLabelVisible, onTouchEnd)}
        onTouchStart={withLabelToggle(true, setLabelVisible, onTouchStart)}
        value={value}
        {...rest}
      />
    </Box>
  );
}

export default Slider;
