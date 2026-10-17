import { useMemo, useState } from "react";
import { Flex, IconButton, Text } from "theme-ui";

import { getDiceRollTotal } from "../../helpers/dice";
import D4Icon from "../../icons/D4Icon";
import D6Icon from "../../icons/D6Icon";
import D8Icon from "../../icons/D8Icon";
import D10Icon from "../../icons/D10Icon";
import D12Icon from "../../icons/D12Icon";
import D20Icon from "../../icons/D20Icon";
import D100Icon from "../../icons/D100Icon";
import DiceRollsIcon from "../../icons/DiceRollsIcon";
import type { DiceRoll as DiceRollValue, DiceType } from "../../types/Dice";

import DiceRoll from "./DiceRoll";

type DiceTypeEntry = { type: DiceType; Icon: React.ElementType };

const DICE_TYPES: DiceTypeEntry[] = [
  { type: "d20", Icon: D20Icon },
  { type: "d12", Icon: D12Icon },
  { type: "d10", Icon: D10Icon },
  { type: "d8", Icon: D8Icon },
  { type: "d6", Icon: D6Icon },
  { type: "d4", Icon: D4Icon },
  { type: "d100", Icon: D100Icon },
];

type DiceRollsProps = { rolls: DiceRollValue[] };

function rolledDiceTypes(rolls: DiceRollValue[]): DiceTypeEntry[] {
  return DICE_TYPES.filter((entry) =>
    rolls.some((roll) => roll.type === entry.type)
  );
}

function ExpandToggleButton({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const label = expanded ? "Hide Rolls" : "Show Rolls";
  return (
    <IconButton aria-label={label} title={label} onClick={onToggle}>
      <DiceRollsIcon />
    </IconButton>
  );
}

function RollBreakdown({
  entries,
  rolls,
}: {
  entries: DiceTypeEntry[];
  rolls: DiceRollValue[];
}) {
  return (
    <Flex sx={{ flexDirection: "column" }}>
      {entries.map(({ type, Icon }) => (
        <DiceRoll key={type} rolls={rolls} type={type}>
          <Icon />
        </DiceRoll>
      ))}
    </Flex>
  );
}

/** Compact total with an optional per-die breakdown for a roster member. */
function DiceRolls({ rolls }: DiceRollsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const total = getDiceRollTotal(rolls);
  const rolledTypes = useMemo(() => rolledDiceTypes(rolls), [rolls]);

  if (total <= 0) {
    return null;
  }

  const toggleExpanded = () => setIsExpanded((expanded) => !expanded);

  return (
    <Flex sx={{ flexDirection: "column" }}>
      <Flex sx={{ alignItems: "center" }}>
        <ExpandToggleButton expanded={isExpanded} onToggle={toggleExpanded} />
        <Text as="p" mx={1} my={1} sx={{ width: "100%" }} variant="body2">
          {total}
        </Text>
      </Flex>
      {isExpanded && <RollBreakdown entries={rolledTypes} rolls={rolls} />}
    </Flex>
  );
}

export default DiceRolls;
