import { Flex, SxProp } from "theme-ui";

import { Color } from "../../helpers/colors";
import { PointerToolSettings as PointerToolSettingsType } from "../../types/Pointer";
import ColorControl from "./shared/ColorControl";

type PointerToolSettingsProps = {
  settings: PointerToolSettingsType;
  onSettingChange: (change: Partial<PointerToolSettingsType>) => void;
};

type PaletteProps = React.ComponentProps<typeof ColorControl>;

const pointerRailSx: SxProp["sx"] = { flexDirection: "column", alignItems: "center" };
const unavailablePointerColors: Color[] = ["black", "darkGray", "lightGray", "white", "primary"];

function pointerPalette(settings: PointerToolSettingsType, update: PointerToolSettingsProps["onSettingChange"]): PaletteProps {
  const selectedColor = settings.color;
  const selectColor = (color: Color) => update({ color });

  return {
    color: selectedColor,
    exclude: unavailablePointerColors,
    onColorChange: selectColor,
  };
}

const PointerToolSettings = ({ settings, onSettingChange }: PointerToolSettingsProps) => {
  const palette = pointerPalette(settings, onSettingChange);
  return <Flex sx={pointerRailSx}><ColorControl {...palette} /></Flex>;
};

export default PointerToolSettings;
