import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import type { DiceMesh } from "../types/Dice";

type ShadowCasterRegistry = {
  removeShadowCaster: (mesh: AbstractMesh) => unknown;
};

/**
 * Libera tudo que uma rolagem registrou fora do array React: timers de sono,
 * referências do ShadowGenerator e as duas instâncias físicas do d100.
 */
export function disposeDiceMeshes(
  dice: DiceMesh[],
  shadowGenerator?: ShadowCasterRegistry
): void {
  for (const die of dice) {
    if (die.sleepTimeout) {
      clearTimeout(die.sleepTimeout);
      die.sleepTimeout = undefined;
    }

    const instances = [die.instance, die.d10Instance].filter(
      (instance): instance is NonNullable<typeof instance> => Boolean(instance)
    );
    for (const instance of instances) {
      shadowGenerator?.removeShadowCaster(instance);
      instance.dispose();
    }
  }
}
