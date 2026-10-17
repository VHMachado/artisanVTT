import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 } from "@babylonjs/core/Maths/math";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import type { InstancedMesh } from "@babylonjs/core";
import { describe, expect, test, vi } from "vitest";

import Dice from "./Dice";
import { seededRandom } from "../helpers/diceRoll";
import type { DiceRollArea } from "../helpers/diceRoll";

function fakeInstance() {
  const impulses: Vector3[] = [];
  const rotations: number[][] = [];
  const instance = {
    position: Vector3.Zero(),
    addRotation: vi.fn((x: number, y: number, z: number) => {
      rotations.push([x, y, z]);
    }),
    physicsImpostor: {
      setLinearVelocity: vi.fn(),
      setAngularVelocity: vi.fn(),
      getObjectCenter: vi.fn(() => Vector3.Zero()),
      applyImpulse: vi.fn((impulse: Vector3) => impulses.push(impulse.clone())),
    },
  } as unknown as InstancedMesh;
  return { instance, impulses, rotations };
}

const area: DiceRollArea = {
  center: new Vector3(10, 8, -5),
  halfWidth: 12,
  halfDepth: 7,
};

/**
 * `Dice.roll` deixou de procurar a bandeja visível na
 * Scene e passou a receber área + RNG. Estes testes fixam o contrato que a
 * sincronização depende: mesma semente → mesmas condições iniciais, sem
 * qualquer mesh `dice_tray_*` no caminho.
 */
describe("Dice.roll", () => {
  test("makes cloned imported child meshes visible while keeping the source template hidden", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const source = MeshBuilder.CreateBox("source", { size: 2 }, scene);
    const detail = MeshBuilder.CreatePlane("engraved_gold", { size: 0.7 }, scene);
    detail.parent = source;
    detail.isVisible = false;
    const instance = source.createInstance("instance");

    Dice.cloneInstanceChildren(source, instance);

    const details = instance
      .getChildMeshes(true)
      .filter((child) => child.name.startsWith("engraved_gold"));
    expect(details).toHaveLength(1);
    expect(details[0].isVisible).toBe(true);
    expect(detail.isVisible).toBe(false);

    scene.dispose();
    engine.dispose();
  });

  test("a mesma semente produz posição, rotação e impulso idênticos", () => {
    const a = fakeInstance();
    const b = fakeInstance();

    Dice.roll(a.instance, area, seededRandom(1234));
    Dice.roll(b.instance, area, seededRandom(1234));

    expect(a.instance.position.asArray()).toEqual(b.instance.position.asArray());
    expect(a.rotations).toEqual(b.rotations);
    expect(a.impulses[0].asArray()).toEqual(b.impulses[0].asArray());
  });

  test("solta no centro da área e dentro do jitter de uma unidade", () => {
    const { instance } = fakeInstance();
    Dice.roll(instance, area, seededRandom(7));

    expect(instance.position.x).toBeGreaterThanOrEqual(area.center.x - 1);
    expect(instance.position.x).toBeLessThanOrEqual(area.center.x + 1);
    expect(instance.position.y).toBe(area.center.y);
    expect(instance.position.z).toBeGreaterThanOrEqual(area.center.z - 1);
    expect(instance.position.z).toBeLessThanOrEqual(area.center.z + 1);
  });

  test("o impulso aponta para baixo, não para a altura de soltura", () => {
    const { instance, impulses } = fakeInstance();
    Dice.roll(instance, area, seededRandom(99));

    // area.center.y é 8 e throwTarget.y é 5. Usar area.center inteiro no
    // vetor faria Y positivo (dado disparado para cima); o alvo físico é o
    // centro do chão, Y=0, portanto o impulso tem Y negativo.
    expect(impulses[0].y).toBeLessThan(0);
  });

  test("zera velocidades antigas antes do novo arremesso", () => {
    const { instance } = fakeInstance();
    Dice.roll(instance, area, seededRandom(1));

    expect(instance.physicsImpostor?.setLinearVelocity).toHaveBeenCalledWith(
      Vector3.Zero()
    );
    expect(instance.physicsImpostor?.setAngularVelocity).toHaveBeenCalledWith(
      Vector3.Zero()
    );
  });
});
