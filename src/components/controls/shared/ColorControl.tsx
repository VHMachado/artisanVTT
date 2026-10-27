import React, { forwardRef, useRef, useState } from "react";
import { Box, SxProp } from "theme-ui";

import colors, { colorOptions, Color } from "../../../helpers/colors";
import Popover from "../../Popover";

type ColorControlProps = {
  color: Color;
  onColorChange: (newColor: Color) => void;
  exclude: Color[];
};

type SwatchProps = {
  color: Color;
  selected: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
} & SxProp;

const gridSx: SxProp["sx"] = {
  width: "104px",
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
};

const Swatch = forwardRef<HTMLDivElement, SwatchProps>(function Swatch(
  { color, selected, onClick, sx },
  ref
) {
  const baseSx = { borderRadius: "50%", transform: "scale(0.75)", backgroundColor: colors[color], cursor: "pointer" };
  return (
    <Box ref={ref} aria-label={`Brush Color ${color}`} onClick={onClick} sx={{ ...baseSx, ...sx }}>
      {selected ? <Box sx={{ width: "100%", height: "100%", border: "2px solid white", position: "absolute", top: 0, borderRadius: "50%" }} /> : null}
    </Box>
  );
});

function Palette({ active, excluded, onChoose }: { active: Color; excluded: Color[]; onChoose: (color: Color) => void }) {
  return (
    <Box sx={gridSx} p={1}>
      {colorOptions.filter((option) => !excluded.includes(option)).map((option) => (
        <Swatch key={option} color={option} selected={option === active} onClick={() => onChoose(option)} sx={{ width: "25%", paddingTop: "25%" }} />
      ))}
    </Box>
  );
}

/**
 * The laser/pointer colour swatch plus its palette.
 *
 * The palette opens to the LEFT, through the shared `Popover` primitive,
 * because this control only ever lives in the vertical rail on the right
 * (MapControls' inline tool-settings strip, the same place the
 * mouse-binding pickers already use `side="left"`). It used to anchor
 * itself 16px BELOW the swatch with no viewport clamping at all, so with
 * the rail scrolled down the palette ran off the bottom edge and was
 * cropped. `Popover` does the edge collision for us.
 */
function ColorControl({ color, onColorChange, exclude }: ColorControlProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const chooseColor = (choice: Color) => {
    onColorChange(choice);
    setIsOpen(false);
  };

  return (
    <>
      <Swatch
        ref={anchorRef}
        color={color}
        selected
        onClick={() => setIsOpen((open) => !open)}
        sx={{ width: "24px", height: "24px" }}
      />
      {isOpen && (
        <Popover
          anchorRef={anchorRef}
          onRequestClose={() => setIsOpen(false)}
          side="left"
          variant="glass"
        >
          <Palette active={color} excluded={exclude} onChoose={chooseColor} />
        </Popover>
      )}
    </>
  );
}

ColorControl.defaultProps = { exclude: [] };

export default ColorControl;
