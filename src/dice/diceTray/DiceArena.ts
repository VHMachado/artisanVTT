import { PhysicsImpostor } from "@babylonjs/core/Physics/physicsImpostor";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math";
import type { Scene } from "@babylonjs/core";

import type { DiceRollArea } from "../../helpers/diceRoll";

/** Espessura das caixas de colisão. Grossas de propósito: uma parede fina
 * deixa um dado rápido atravessar entre dois substeps (tunneling). */
const collisionSize = 50;

type CollisionBox = {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
};

type CollisionBoxes = Record<
  "wallTop" | "wallBottom" | "wallLeft" | "wallRight" | "ground" | "roof",
  CollisionBox
>;

/** Dimensões puras dos seis corpos, separadas da criação Babylon para os
 * casos panorâmico e vertical poderem ser cobertos sem WebGL/Ammo no teste. */
export function collisionBoxesFor(area: DiceRollArea): CollisionBoxes {
  const { center, halfWidth, halfDepth } = area;
  const horizontalSpan = halfWidth * 2 + collisionSize * 2;
  const depthSpan = halfDepth * 2 + collisionSize * 2;
  const wallOffsetWidth = collisionSize / 2 + halfWidth;
  const wallOffsetDepth = collisionSize / 2 + halfDepth;

  return {
    wallTop: {
      x: center.x,
      y: 0,
      z: center.z - wallOffsetDepth,
      width: horizontalSpan,
      height: collisionSize,
      depth: collisionSize,
    },
    wallBottom: {
      x: center.x,
      y: 0,
      z: center.z + wallOffsetDepth,
      width: horizontalSpan,
      height: collisionSize,
      depth: collisionSize,
    },
    wallLeft: {
      x: center.x + wallOffsetWidth,
      y: 0,
      z: center.z,
      width: collisionSize,
      height: collisionSize,
      depth: depthSpan,
    },
    wallRight: {
      x: center.x - wallOffsetWidth,
      y: 0,
      z: center.z,
      width: collisionSize,
      height: collisionSize,
      depth: depthSpan,
    },
    ground: {
      x: center.x,
      y: -collisionSize / 2,
      z: center.z,
      width: horizontalSpan,
      height: collisionSize,
      depth: depthSpan,
    },
    roof: {
      x: center.x,
      y: collisionSize / 2 + 20,
      z: center.z,
      width: horizontalSpan,
      height: collisionSize,
      depth: depthSpan,
    },
  };
}

/**
 * As paredes, o chão e o teto invisíveis onde os dados caem — a "arena".
 *
 * Substitui `dice/diceTray/DiceTray.ts` no caminho novo. A arena
 * não possui malha nem textura: há só `Mesh.CreateBox` invisíveis para colisão,
 * e as dimensões vêm da área visível do canvas, porque os dados agora rolam
 * sobre a grid do mapa e precisam caber exatamente no que o jogador vê.
 *
 * Também é o que resolve a dependência que `Dice.roll` tinha da bandeja:
 * ele procurava `dice_tray_single`/`_double` pelo id e lançava se não
 * achasse. Agora recebe a área por parâmetro (ver helpers/diceRoll.ts).
 */
class DiceArena {
  private readonly scene: Scene;
  private readonly bodies: Mesh[] = [];
  private area: DiceRollArea;

  constructor(scene: Scene, area: DiceRollArea) {
    this.scene = scene;
    this.area = area;
    this.build();
  }

  /** A área atual, para alimentar `Dice.roll`. */
  get rollArea(): DiceRollArea {
    return this.area;
  }

  private createCollision(
    name: string,
    box: CollisionBox,
    friction: number
  ): Mesh {
    const collision = Mesh.CreateBox(
      name,
      1,
      this.scene,
      true,
      Mesh.DOUBLESIDE
    );
    collision.scaling = new Vector3(box.width, box.height, box.depth);
    collision.position.x = box.x;
    collision.position.y = box.y;
    collision.position.z = box.z;
    collision.computeWorldMatrix(true);
    collision.physicsImpostor = new PhysicsImpostor(
      collision,
      PhysicsImpostor.BoxImpostor,
      { mass: 0, friction },
      this.scene
    );
    collision.isVisible = false;
    this.bodies.push(collision);
    return collision;
  }

  private build() {
    const boxes = collisionBoxesFor(this.area);

    // Mesmos coeficientes de atrito da bandeja antiga: paredes 10, chão 20
    // (o dado precisa parar, não deslizar para sempre) e teto 100.
    this.createCollision("wallTop", boxes.wallTop, 10);
    this.createCollision("wallBottom", boxes.wallBottom, 10);
    this.createCollision("wallLeft", boxes.wallLeft, 10);
    this.createCollision("wallRight", boxes.wallRight, 10);
    // O chão fica em y=0: é o plano que a câmera de cima enquadra, então o
    // dado em repouso aparece exatamente sobre a grid.
    this.createCollision("ground", boxes.ground, 20);
    // Teto bem acima da altura de soltura, só para conter um arremesso que
    // ricocheteie para cima.
    this.createCollision("roof", boxes.roof, 100);
  }

  /**
   * Refaz a arena para uma nova área visível (redimensionamento da janela,
   * zoom do mapa). Recriar é mais seguro que mover: um `PhysicsImpostor`
   * estático movido à mão não reposiciona de forma confiável no Ammo sem
   * um `forceUpdate`, e aqui são seis corpos — reconstruir custa um punhado
   * de caixas e não pode dar errado pela metade.
   *
   * Dados em voo continuam no mundo: só os limites mudam.
   */
  resize(area: DiceRollArea) {
    this.area = area;
    this.dispose();
    this.build();
  }

  dispose() {
    for (const body of this.bodies) {
      body.physicsImpostor?.dispose();
      body.dispose();
    }
    this.bodies.length = 0;
  }

  /** A altura de soltura padrão, acima do chão e abaixo do teto. */
  static dropHeight(): number {
    return 8;
  }

  static areaFor(
    center: Vector3,
    halfWidth: number,
    halfDepth: number
  ): DiceRollArea {
    return {
      center: new Vector3(center.x, DiceArena.dropHeight(), center.z),
      halfWidth,
      halfDepth,
    };
  }
}

export default DiceArena;
