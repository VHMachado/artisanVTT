import React from "react";
import { IconButton } from "theme-ui";

type ToolToggleProps = {
  active: boolean;
  disabled?: boolean;
  onChange: (active: boolean) => void;
  enableLabel: string;
  disableLabel: string;
  enabledIcon: React.ReactNode;
  disabledIcon: React.ReactNode;
};

/** Renders a binary toolbar action with its next action exposed to assistive UI. */
function ToolToggle({
  active,
  disabled = false,
  onChange,
  enableLabel,
  disableLabel,
  enabledIcon,
  disabledIcon,
}: ToolToggleProps) {
  const label = active ? disableLabel : enableLabel;
  return (
    <IconButton
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!active)}
    >
      {active ? enabledIcon : disabledIcon}
    </IconButton>
  );
}

export default ToolToggle;
