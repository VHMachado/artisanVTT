import type { InstancedMesh, Mesh } from "@babylonjs/core";
import type Dice from "../dice/Dice";

export type DiceType = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100";
export type DiceFace = number | "unknown";

export interface DiceRoll {
  roll: DiceFace;
  type: DiceType;
}

export interface DiceMesh {
  asleep: boolean;
  type: DiceType;
  instance: InstancedMesh;
  sleepTimeout?: NodeJS.Timeout;
  d10Instance?: InstancedMesh;
}

export interface DiceState {
  rolls: DiceRoll[];
  share: boolean;
}

/** One of the built-in dice sets a player can choose in the dice tray. */
export interface DefaultDice {
  color: string;
  name: string;
  class: typeof Dice;
  key: string;
}

export type DiceMeshes = Record<DiceType, Mesh>;
