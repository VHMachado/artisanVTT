import type { AbstractMesh, InstancedMesh, Mesh, Scene } from "@babylonjs/core";
import { Vector3 } from "@babylonjs/core/Maths/math";
import { PhysicsImpostor } from "@babylonjs/core/Physics/physicsImpostor";
import type { PhysicsImpostorParameters } from "@babylonjs/core/Physics/physicsImpostor";
import "@babylonjs/core/Meshes/instancedMesh";

import type { DiceRollArea } from "../helpers/diceRoll";
import { lerp } from "../helpers/shared";
import type { DiceType } from "../types/Dice";

const THROW_SPEED_RANGE = { min: 220, max: 320 };

const PHYSICAL_PROPERTIES_BY_TYPE: Partial<Record<DiceType, PhysicsImpostorParameters>> = {
  d4: { mass: 4, friction: 4 },
  d6: { mass: 6, friction: 4 },
  d8: { mass: 6.2, friction: 4 },
  d10: { mass: 7, friction: 4 },
  d100: { mass: 7, friction: 4 },
  d12: { mass: 8, friction: 4 },
  d20: { mass: 10, friction: 4 },
};
const DEFAULT_PHYSICAL_PROPERTIES: PhysicsImpostorParameters = { mass: 10, friction: 4 };

function cloneChildNode(child: ReturnType<Mesh["getChildTransformNodes"]>[number], instance: InstancedMesh) {
  const clone = child.clone(child.name, instance);
  if (!clone) throw new Error("Unable to clone dice child");
  clone.setAbsolutePosition(child.getAbsolutePosition());
  clone.name = child.name;
  if ("isVisible" in clone) (clone as AbstractMesh).isVisible = true;
  instance.addChild(clone as AbstractMesh);
}

function haltInstanceMotion(instance: InstancedMesh) {
  instance.physicsImpostor?.setLinearVelocity(Vector3.Zero());
  instance.physicsImpostor?.setAngularVelocity(Vector3.Zero());
}

function placeAndSpinInstance(instance: InstancedMesh, area: DiceRollArea, random: () => number) {
  instance.position = new Vector3(
    area.center.x + (random() * 2 - 1),
    area.center.y,
    area.center.z + (random() * 2 - 1)
  );
  instance.addRotation(random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2);
}

function pickThrowTarget(area: DiceRollArea, random: () => number) {
  return new Vector3(
    lerp(area.center.x - area.halfWidth, area.center.x + area.halfWidth, random()),
    5,
    lerp(area.center.z - area.halfDepth, area.center.z + area.halfDepth, random())
  );
}

// O impulso aponta do alvo sorteado PARA o centro da área (antes era
// sempre para a origem, que era o centro da bandeja) — é o que faz o
// dado atravessar a área em vez de sair reto para fora dela.
// O centro guarda a altura de soltura no Y. O impulso, porém, deve
// apontar para o centro do CHÃO (Y=0): usar `area.center` inteiro aqui
// jogaria o dado para cima porque center.y=8 e throwTarget.y=5.
function buildThrowImpulse(area: DiceRollArea, throwTarget: Vector3, random: () => number) {
  const speed = lerp(THROW_SPEED_RANGE.min, THROW_SPEED_RANGE.max, random());
  return new Vector3(area.center.x, 0, area.center.z).subtract(throwTarget).normalizeToNew().scale(speed);
}

function launchInstance(instance: InstancedMesh, impulse: Vector3) {
  instance.physicsImpostor?.applyImpulse(impulse, instance.physicsImpostor.getObjectCenter());
}

function unsupportedLoadError(scene: Scene) {
  return new Error(`Unable to load ${scene}`);
}

function unsupportedInstanceError(diceType: DiceType, scene: Scene) {
  return new Error(`No instance available for ${diceType} in ${scene}`);
}

/** Resolves the InstancedMesh that actually carries `.physicsImpostor` for
 * a die's RENDERED instance — its own, unless `createInstanceFromMesh`
 * attached a separate low-poly physics proxy as its parent (physicsHull.ts).
 * Every physics read/write on a rolled die (roll, velocity, sleep check)
 * must go through this instead of assuming `instance.physicsImpostor`
 * directly, or it silently reads/writes nothing once the proxy exists. */
export function physicsInstanceOf(instance: InstancedMesh): InstancedMesh {
  const linked = (
    instance.metadata as { physicsInstance?: InstancedMesh } | null | undefined
  )?.physicsInstance;
  return linked ?? instance;
}

class Dice {
  static instanceCount = 0;

  static getDicePhysicalProperties(diceType: DiceType) {
    return PHYSICAL_PROPERTIES_BY_TYPE[diceType] ?? DEFAULT_PHYSICAL_PROPERTIES;
  }

  static cloneInstanceChildren(mesh: Mesh, instance: InstancedMesh) {
    for (const child of mesh.getChildTransformNodes()) {
      cloneChildNode(child, instance);
    }
  }

  static createInstanceFromMesh(
    mesh: Mesh,
    name: string,
    physicalProperties: PhysicsImpostorParameters,
    scene: Scene,
    hullMesh?: Mesh
  ) {
    const instance = mesh.createInstance(name);
    Dice.cloneInstanceChildren(mesh, instance);

    if (hullMesh) {
      // Low-poly collision-only proxy (physicsHull.ts): the body lives
      // HERE, parented BELOW the rendered instance, because Ammo's
      // ConvexHullImpostor construction cost scales super-linearly with
      // input vertex count (see physicsHull.ts's doc comment) and the
      // detailed CC0 mesh can carry thousands of bevel/engraving
      // vertices a die's real convex shape never needed for collision.
      // The rendered instance stays at a zero local offset so it tracks
      // the proxy's physics-driven world transform exactly, with no
      // per-frame sync code needed — Babylon already recomputes a
      // child's world matrix from its parent every frame.
      const physicsInstance = hullMesh.createInstance(`${name}_hull`);
      physicsInstance.isVisible = false;
      physicsInstance.isPickable = false;
      physicsInstance.physicsImpostor = new PhysicsImpostor(
        physicsInstance,
        PhysicsImpostor.ConvexHullImpostor,
        physicalProperties,
        scene
      );
      instance.parent = physicsInstance;
      instance.position = Vector3.Zero();
      instance.metadata = { ...(instance.metadata || {}), physicsInstance };
    } else {
      instance.position = mesh.position;
      instance.physicsImpostor = new PhysicsImpostor(
        instance,
        PhysicsImpostor.ConvexHullImpostor,
        physicalProperties,
        scene
      );
    }

    return instance;
  }

  static createInstanceMesh(
    mesh: Mesh,
    physicalProperties: PhysicsImpostorParameters,
    scene: Scene,
    hullMesh?: Mesh
  ): InstancedMesh {
    Dice.instanceCount += 1;
    return Dice.createInstanceFromMesh(
      mesh,
      `dice_instance_${Dice.instanceCount}`,
      physicalProperties,
      scene,
      hullMesh
    );
  }

  /**
   * Arremessa uma instância de dado.
   *
   * `area` e `random` são PARÂMETROS. Antes este
   * método procurava a malha visível da bandeja de madeira
   * (`dice_tray_single`/`_double`) e **lançava** se não achasse nenhuma —
   * o que acontecia antes de os dados rolarem sobre a própria grid, já
   * que a bandeja não é mais carregada. E usava `Math.random` direto, o que
   * impedia dois clientes de reproduzirem o mesmo arremesso a partir de
   * uma semente (ver helpers/diceRoll.ts).
   *
   * `random` é opcional e cai em `Math.random` para o caso não
   * compartilhado, onde ninguém precisa reproduzir nada.
   */
  static roll(instance: InstancedMesh, area: DiceRollArea, random: () => number = Math.random) {
    haltInstanceMotion(instance);
    placeAndSpinInstance(instance, area, random);
    const throwTarget = pickThrowTarget(area, random);
    launchInstance(instance, buildThrowImpulse(area, throwTarget, random));
  }

  static async load(scene: Scene) {
    throw unsupportedLoadError(scene);
  }

  static createInstance(diceType: DiceType, scene: Scene): InstancedMesh {
    throw unsupportedInstanceError(diceType, scene);
  }
}

export default Dice;
