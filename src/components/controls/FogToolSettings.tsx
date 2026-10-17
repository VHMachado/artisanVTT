import { useMedia } from "react-media";
import { Flex } from "theme-ui";

import { useKeyboard } from "../../contexts/KeyboardContext";
import FogBrushIcon from "../../icons/FogBrushIcon";
import FogPolygonIcon from "../../icons/FogPolygonIcon";
import FogRectangleIcon from "../../icons/FogRectangleIcon";
import FogRemoveIcon from "../../icons/FogRemoveIcon";
import FogToggleIcon from "../../icons/FogToggleIcon";
import shortcuts from "../../shortcuts";
import { FogToolSettings as FogToolSettingsType, FogToolType } from "../../types/Fog";
import Divider from "../Divider";
import RadioIconButton from "../RadioIconButton";
import FogCutToggle from "./shared/FogCutToggle";
import FogPreviewToggle from "./shared/FogPreviewToggle";
import MultilayerToggle from "./shared/MultilayerToggle";
import ToolSection, { Tool } from "./shared/ToolSection";

type FogToolSettingsProps = {
  settings: FogToolSettingsType;
  onSettingChange: (change: Partial<FogToolSettingsType>) => void;
};

type FogChangeFactory = (settings: FogToolSettingsType) => Partial<FogToolSettingsType>;

const fogShortcutChanges: Array<[(event: KeyboardEvent) => boolean, FogChangeFactory]> = [
  [shortcuts.fogPolygon, () => ({ type: "polygon" })],
  [shortcuts.fogRectangle, () => ({ type: "rectangle" })],
  [shortcuts.fogBrush, () => ({ type: "brush" })],
  [shortcuts.fogToggle, () => ({ type: "toggle" })],
  [shortcuts.fogErase, () => ({ type: "remove" })],
  [shortcuts.fogLayer, ({ multilayer }) => ({ multilayer: !multilayer })],
  [shortcuts.fogPreview, ({ preview }) => ({ preview: !preview })],
  [shortcuts.fogCut, ({ useFogCut }) => ({ useFogCut: !useFogCut })],
];

function changeForFogShortcut(event: KeyboardEvent, settings: FogToolSettingsType) {
  const match = fogShortcutChanges.find(([matches]) => matches(event));
  return match?.[1](settings);
}

function drawingTools(type: FogToolType, disabled: boolean): Tool[] {
  return [
    { id: "polygon", title: "Fog Polygon (P)", isSelected: type === "polygon", icon: <FogPolygonIcon />, disabled },
    { id: "rectangle", title: "Fog Rectangle (R)", isSelected: type === "rectangle", icon: <FogRectangleIcon />, disabled },
    { id: "brush", title: "Fog Brush (B)", isSelected: type === "brush", icon: <FogBrushIcon />, disabled },
  ];
}

function FogModes({ type, locked, onChoose }: { type: FogToolType; locked: boolean; onChoose: (type: FogToolType) => void }) {
  return (
    <>
      <RadioIconButton title="Toggle Fog (T)" onClick={() => onChoose("toggle")} isSelected={type === "toggle"} disabled={locked}>
        <FogToggleIcon />
      </RadioIconButton>
      <RadioIconButton title="Erase Fog (E)" onClick={() => onChoose("remove")} isSelected={type === "remove"} disabled={locked}>
        <FogRemoveIcon />
      </RadioIconButton>
    </>
  );
}

function FogOptions({ settings, onChange }: { settings: FogToolSettingsType; onChange: FogToolSettingsProps["onSettingChange"] }) {
  return (
    <>
      <FogCutToggle useFogCut={settings.useFogCut} onFogCutChange={(useFogCut) => onChange({ useFogCut })} disabled={settings.preview} />
      <MultilayerToggle multilayer={settings.multilayer} onMultilayerChange={(multilayer) => onChange({ multilayer })} disabled={settings.preview} />
      <FogPreviewToggle useFogPreview={settings.preview} onFogPreviewChange={(preview) => onChange({ preview })} />
    </>
  );
}

function FogToolSettings({ settings, onSettingChange }: FogToolSettingsProps) {
  useKeyboard((event) => {
    const change = changeForFogShortcut(event, settings);
    if (change) onSettingChange(change);
  });

  const compact = useMedia({ query: "(max-width: 799px)" });
  const chooseDrawingTool = (tool: Tool) => onSettingChange({ type: tool.id as FogToolType });

  return (
    <Flex sx={{ flexDirection: "column", alignItems: "center" }}>
      <ToolSection tools={drawingTools(settings.type, settings.preview)} onToolClick={chooseDrawingTool} collapse={compact} />
      <Divider vertical={false} fill />
      <FogModes type={settings.type} locked={settings.preview} onChoose={(type) => onSettingChange({ type })} />
      <Divider vertical={false} fill />
      <FogOptions settings={settings} onChange={onSettingChange} />
    </Flex>
  );
}

export default FogToolSettings;
