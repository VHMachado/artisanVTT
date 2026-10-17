import type { ReactNode } from "react";
import { Box, Flex, Text } from "theme-ui";

import type { DiceRoll as DiceRollValue, DiceType } from "../../types/Dice";

type DiceRollProps = {
  rolls: DiceRollValue[];
  type: DiceType;
  children: ReactNode;
};

type NumericRoll = DiceRollValue & { roll: number };

function isNumericRollOfType(
  roll: DiceRollValue,
  type: DiceType
): roll is NumericRoll {
  return roll.type === type && typeof roll.roll === "number";
}

function numericRollsOfType(
  rolls: DiceRollValue[],
  type: DiceType
): NumericRoll[] {
  return rolls.filter((roll): roll is NumericRoll => isNumericRollOfType(roll, type));
}

function RollValue({
  result,
  index,
  type,
}: {
  result: NumericRoll;
  index: number;
  type: DiceType;
}) {
  return (
    <Text as="p" key={`${type}-${index}`} mx={1} my={1} variant="caption">
      {result.roll}
    </Text>
  );
}

/** Values from one die shape in the expanded roll history. */
function DiceRoll({ rolls, type, children }: DiceRollProps) {
  const results = numericRollsOfType(rolls, type);

  return (
    <Flex sx={{ flexWrap: "wrap", alignItems: "center" }}>
      <Box sx={{ transform: "scale(0.8)" }}>{children}</Box>
      {results.map((result, index) => (
        <RollValue
          key={`${type}-${index}`}
          result={result}
          index={index}
          type={type}
        />
      ))}
    </Flex>
  );
}

export default DiceRoll;
