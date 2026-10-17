import { applyChange, revertChange, diff as deepDiff } from "deep-diff";
import type { Diff } from "deep-diff";
import get from "lodash.get";

type EditOrArrayChange<LHS> = Diff<LHS> & { kind: "E" | "A" };

function isEditOrArrayChange<LHS>(change: Diff<LHS>): change is EditOrArrayChange<LHS> {
  return change.kind === "E" || change.kind === "A";
}

function referencesLiveValue<LHS>(target: LHS, change: EditOrArrayChange<LHS>): boolean {
  return get(target, change.path as any) !== undefined;
}

export function applyChanges<LHS>(target: LHS, changes: Diff<LHS>[]) {
  changes.forEach((change) => {
    const safe = !isEditOrArrayChange(change) || referencesLiveValue(target, change);
    if (safe) applyChange(target, true, change);
  });
}

export function revertChanges<LHS>(target: LHS, changes: Diff<LHS>[]) {
  changes.forEach((change) => revertChange(target, true, change));
}

export const diff = deepDiff;
