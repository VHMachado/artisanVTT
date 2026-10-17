import React, { useState } from "react";
import { Box, SxProp } from "theme-ui";

import colors, { colorOptions, Color } from "../../../helpers/colors";
import MapMenu from "../../map/MapMenu";

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

type PaletteAnchor = {
  left: string;
  top: string;
  style: React.CSSProperties;
  excludeNode: HTMLDivElement;
};

const gridSx: SxProp["sx"] = {
  width: "104px",
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
};

function Swatch({ color, selected, onClick, sx }: SwatchProps) {
  const baseSx = { borderRadius: "50%", transform: "scale(0.75)", backgroundColor: colors[color], cursor: "pointer" };
  return (
    <Box aria-label={`Brush Color ${color}`} onClick={onClick} sx={{ ...baseSx, ...sx }}>
      {selected ? <Box sx={{ width: "100%", height: "100%", border: "2px solid white", position: "absolute", top: 0, borderRadius: "50%" }} /> : null}
    </Box>
  );
}

function anchorFor(control: HTMLDivElement): PaletteAnchor {
  const { left, width, bottom } = control.getBoundingClientRect();
  return {
    left: `${left + width / 2}px`,
    top: `${bottom + 16}px`,
    style: { transform: "translateX(-50%)" },
    excludeNode: control,
  };
}

function Palette({ active, excluded, onChoose }: { active: Color; excluded: Color[]; onChoose: (color: Color) => void }) {
  return (
    <Box sx={gridSx} p={1}>
      {colorOptions.filter((option) => !excluded.includes(option)).map((option) => (
        <Swatch key={option} color={option} selected={option === active} onClick={() => onChoose(option)} sx={{ width: "25%", paddingTop: "25%" }} />
      ))}
    </Box>
  );
}

function ColorControl({ color, onColorChange, exclude }: ColorControlProps) {
  const [anchor, setAnchor] = useState<PaletteAnchor | null>(null);
  const closePalette = () => setAnchor(null);
  const chooseColor = (choice: Color) => {
    onColorChange(choice);
    closePalette();
  };

  return (
    <>
      <Swatch color={color} selected onClick={(event) => setAnchor(anchor ? null : anchorFor(event.currentTarget))} sx={{ width: "24px", height: "24px" }} />
      <MapMenu isOpen={anchor !== null} onRequestClose={closePalette} {...(anchor || {})}>
        <Palette active={color} excluded={exclude} onChoose={chooseColor} />
      </MapMenu>
    </>
  );
}

ColorControl.defaultProps = { exclude: [] };

export default ColorControl;
