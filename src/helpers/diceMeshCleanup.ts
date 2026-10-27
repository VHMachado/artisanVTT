import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { physicsInstanceOf } from "../dice/Dice";
import type { DiceMesh } from "../types/Dice";

type ShadowCasterRegistry = {
  removeShadowCaster: (mesh: AbstractMesh) => unknown;
};

/**
 * Libera tudo que uma rolagem registrou fora do array React: timers de sono,
 * referências do ShadowGenerator, as duas instâncias físicas do d100, e o
 * proxy de física de baixo-poly de cada uma (physicsHull.ts) quando existir
 * — a instância renderizada é filha dele, então descartar só a renderizada
 * deixaria o proxy invisível (e seu corpo Ammo) pendurado na cena.
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
      const physicsInstance = physicsInstanceOf(instance);
      instance.dispose();
      if (physicsInstance !== instance) {
        physicsInstance.dispose();
      }
    }
  }
}
