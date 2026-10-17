import Case from "case";

import { createCC0DiceStyle } from "./CC0Dice";
import type Dice from "./Dice";
import type { DefaultDice } from "../types/Dice";

export const diceStyles = [
  { key: "galaxy", color: "#312E81", metallic: 0.55, roughness: 0.28 },
  { key: "nebula", color: "#0F766E", metallic: 0.35, roughness: 0.32 },
  { key: "sunrise", color: "#F97316", metallic: 0.25, roughness: 0.36 },
  { key: "sunset", color: "#DC2626", metallic: 0.28, roughness: 0.34 },
  { key: "iron", color: "#64748B", metallic: 0.82, roughness: 0.25 },
  { key: "walnut", color: "#92400E", metallic: 0.08, roughness: 0.6 },
  { key: "glass", color: "#38BDF8", metallic: 0.05, roughness: 0.15 },
  { key: "gemstone", color: "#A855F7", metallic: 0.2, roughness: 0.2 },
] as const;

type DiceClasses = Record<string, typeof Dice>;

export const diceClasses: DiceClasses = Object.fromEntries(
  diceStyles.map((style) => [style.key, createCC0DiceStyle(style)])
);

export const dice: DefaultDice[] = diceStyles.map((style) => ({
  key: style.key,
  name: Case.capital(style.key),
  class: diceClasses[style.key],
  color: style.color,
}));

/** Clears static meshes and materials bound to a disposed Babylon scene. */
export function resetDiceCaches() {
  for (const diceClass of Object.values(diceClasses)) {
    (diceClass as unknown as { material?: unknown }).material = undefined;
    (diceClass as unknown as { meshes?: unknown }).meshes = undefined;
  }
}