import { Flex, IconButton } from "theme-ui";

import AddIcon from "../../icons/AddIcon";
import SelectMultipleIcon from "../../icons/SelectMultipleIcon";
import SelectSingleIcon from "../../icons/SelectSingleIcon";

import Search from "../Search";
import RadioIconButton from "../RadioIconButton";

import { useGroup } from "../../contexts/GroupContext";

type TileActionBarProps = {
  onAdd: () => void;
  addTitle: string;
};

function TileActionBar({ onAdd, addTitle }: TileActionBarProps) {
  const {
    selectMode,
    onSelectModeChange,
    onClearSelection,
    filter,
    onFilterChange,
  } = useGroup();
  const isMultiSelect = selectMode === "multiple" || selectMode === "range";

  return (
    <Flex
      bg="muted"
      onFocus={onClearSelection}
      sx={{
        alignItems: "center",
        border: "1px solid",
        borderColor: "text",
        borderRadius: "4px",
        ":focus-within": {
          outline: "1px auto",
          outlineColor: "primary",
          outlineOffset: 0,
        },
      }}
    >
      <Search value={filter} onChange={(e) => onFilterChange(e.target.value)} />
      <Flex
        mr={1}
        px={1}
        sx={{
          borderRight: "1px solid",
          borderColor: "text",
          height: "36px",
          alignItems: "center",
        }}
      >
        <RadioIconButton
          title="Select Single"
          onClick={() => onSelectModeChange("single")}
          isSelected={selectMode === "single"}
        >
          <SelectSingleIcon />
        </RadioIconButton>
        <RadioIconButton
          title="Select Multiple"
          onClick={() => onSelectModeChange("multiple")}
          isSelected={isMultiSelect}
        >
          <SelectMultipleIcon />
        </RadioIconButton>
      </Flex>
      <IconButton onClick={onAdd} aria-label={addTitle} title={addTitle} mr={1}>
        <AddIcon />
      </IconButton>
    </Flex>
  );
}

export default TileActionBar;
