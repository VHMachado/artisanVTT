import { Flex } from "theme-ui";

import { useKeyboard } from "../../contexts/KeyboardContext";
import PathIcon from "../../icons/SelectPathIcon";
import RectIcon from "../../icons/SelectRectangleIcon";
import shortcuts from "../../shortcuts";
import { SelectToolSettings as SelectToolSettingsType, SelectToolType } from "../../types/Select";
import ToolSection, { Tool } from "./shared/ToolSection";

type SelectToolSettingsProps = {
  settings: SelectToolSettingsType;
  onSettingChange: (change: Partial<SelectToolSettingsType>) => void;
};

const selectShortcutTypes: Array<[(event: KeyboardEvent) => boolean, SelectToolType]> = [
  [shortcuts.selectPath, "path"],
  [shortcuts.selectRect, "rectangle"],
];

function selectTypeFor(event: KeyboardEvent) {
  return selectShortcutTypes.find(([matches]) => matches(event))?.[1];
}

function selectionTools(selected: SelectToolType): Tool[] {
  return [
    { id: "rectangle", title: "Rectangle Selection (R)", isSelected: selected === "rectangle", icon: <RectIcon /> },
    { id: "path", title: "Lasso Selection (L)", isSelected: selected === "path", icon: <PathIcon /> },
  ];
}

function SelectToolSettings({ settings, onSettingChange }: SelectToolSettingsProps) {
  useKeyboard((event) => {
    const type = selectTypeFor(event);
    if (type) onSettingChange({ type });
  });

  const chooseTool = (tool: Tool) => onSettingChange({ type: tool.id as SelectToolType });

  return (
    <Flex sx={{ flexDirection: "column", alignItems: "center" }}>
      <ToolSection tools={selectionTools(settings.type)} onToolClick={chooseTool} />
    </Flex>
  );
}

export default SelectToolSettings;
