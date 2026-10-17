import React, { useEffect, useState } from "react";
import { Box, Flex } from "theme-ui";

import RadioIconButton from "../../RadioIconButton";

export type Tool = {
  id: string;
  title: string;
  isSelected: boolean;
  icon: React.ReactNode;
  disabled?: boolean;
};

type ToolSectionProps = {
  collapse: boolean;
  tools: Tool[];
  onToolClick: (tool: Tool) => void;
};

function useDisplayedTool(tools: Tool[]) {
  const [displayedTool, setDisplayedTool] = useState<Tool>();

  useEffect(() => {
    const selectedTool = tools.find((tool) => tool.isSelected);
    if (selectedTool) {
      setDisplayedTool(selectedTool);
      return;
    }
    setDisplayedTool((previous) =>
      previous ? { ...previous, isSelected: false } : tools[0]
    );
  }, [tools]);

  return displayedTool;
}

type ToolButtonProps = {
  tool: Tool;
  onSelect: (tool: Tool) => void;
};

function ToolButton({ tool, onSelect }: ToolButtonProps) {
  return (
    <RadioIconButton
      title={tool.title}
      onClick={() => onSelect(tool)}
      isSelected={tool.isSelected}
      disabled={tool.disabled}
    >
      {tool.icon}
    </RadioIconButton>
  );
}

function CollapseMarker() {
  return (
    <Box
      sx={{
        position: "absolute",
        width: 0,
        height: 0,
        borderTop: "4px solid",
        borderTopColor: "text",
        borderLeft: "4px solid transparent",
        borderRight: "4px solid transparent",
        transform: "translate(0, -4px) rotate(-45deg)",
        bottom: 0,
        right: 0,
        pointerEvents: "none",
      }}
    />
  );
}

function ToolSection({ collapse, tools, onToolClick }: ToolSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const displayedTool = useDisplayedTool(tools);

  const selectTool = (tool: Tool) => {
    if (collapse) {
      setIsExpanded(tool.isSelected ? !isExpanded : false);
    }
    onToolClick(tool);
  };

  if (!collapse) {
    return <>{tools.map((tool) => <ToolButton key={tool.id} tool={tool} onSelect={selectTool} />)}</>;
  }

  if (!displayedTool) {
    return null;
  }

  const hiddenTools = tools.filter((tool) => !tool.isSelected);
  return (
    <Box sx={{ position: "relative" }}>
      <ToolButton tool={displayedTool} onSelect={selectTool} />
      <CollapseMarker />
      {isExpanded && (
        <Flex
          sx={{
            position: "absolute",
            top: "40px",
            left: "50%",
            transform: "translateX(-50%)",
            flexDirection: "column",
            borderRadius: "4px",
          }}
          bg="overlay"
          p={2}
        >
          {hiddenTools.map((tool) => (
            <ToolButton key={tool.id} tool={tool} onSelect={selectTool} />
          ))}
        </Flex>
      )}
    </Box>
  );
}

ToolSection.defaultProps = {
  collapse: false,
};

export default ToolSection;
