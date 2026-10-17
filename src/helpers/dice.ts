import { Vector3 } from "@babylonjs/core/Maths/math";
import type { InstancedMesh, TransformNode } from "@babylonjs/core";

import type { DiceMesh, DiceRoll } from "../types/Dice";

const diceLocatorPrefix = "dice_locator_";

/** Returns the locator closest to world-up, which identifies the exposed face. */
export function getDiceInstanceRoll(instance: InstancedMesh): number {
  let upwardLocator: TransformNode | undefined;
  let greatestAlignment = -Infinity;

  for (const locator of instance.getChildTransformNodes()) {
    if (!locator.name.startsWith(diceLocatorPrefix)) {
      continue;
    }
    const fromCenter = locator
      .getAbsolutePosition()
      .subtract(instance.getAbsolutePosition())
      .normalize();
    const alignment = Vector3.Dot(fromCenter, Vector3.Up());

    if (alignment > greatestAlignment) {
      greatestAlignment = alignment;
      upwardLocator = locator;
    }
  }

  if (!upwardLocator) {
    return 0;
  }

  const face = Number.parseInt(upwardLocator.name.slice(diceLocatorPrefix.length), 10);
  return Number.isNaN(face) ? 0 : face;
}

/** Converts a settled mesh (and the paired percentile die when present) into a roll. */
export function getDiceRoll(dice: DiceMesh): DiceRoll {
  let roll = getDiceInstanceRoll(dice.instance);

  if (dice.d10Instance) {
    const tens = getDiceInstanceRoll(dice.d10Instance);
    roll = roll === 0 && tens === 0 ? 100 : roll + tens;
  } else if (dice.type === "d10" && roll === 0) {
    roll = 10;
  }

  return { type: dice.type, roll };
}

/** Sums known results; unsettled dice deliberately do not affect the displayed total. */
export function getDiceRollTotal(rolls: DiceRoll[]): number {
  return rolls.reduce(
    (total, roll) => (typeof roll.roll === "number" ? total + roll.roll : total),
    0
  );
}
