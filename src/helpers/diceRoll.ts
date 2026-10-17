import { Vector3 } from "@babylonjs/core/Maths/math";

import type { DiceType } from "../types/Dice";

/** Quantos dados de cada tipo participam de uma rolagem. */
export type DiceCounts = Partial<Record<DiceType, number>>;

/** O payload mínimo que cruza o broker. Física nunca viaja no fio. */
export type SharedDiceRollPayload = {
  counts: DiceCounts;
  seed: number;
};

/** Pedido interno da camada visual. `publishResults` distingue a rolagem
 * local (que atualiza player_state.dice) da animação recebida de outra
 * pessoa (que jamais pode sobrescrever os dados do jogador local). */
export type DiceRollRequest = SharedDiceRollPayload & {
  publishResults: boolean;
};

export const DICE_TYPES: DiceType[] = [
  "d4",
  "d6",
  "d8",
  "d10",
  "d12",
  "d20",
  "d100",
];
export const MAX_DICE_PER_TYPE = 20;
export const MAX_DICE_TOTAL = 60;

/**
 * A caixa (em unidades de mundo do Babylon) onde os dados caem e se
 * acomodam. Antes isto era implícito: `Dice.roll` procurava a
 * malha visível da bandeja de madeira (`dice_tray_single`/`_double`) e
 * lia seu bounding box. Como a bandeja saiu — os dados rolam sobre a
 * própria grid agora —, a área passou a ser um parâmetro.
 */
export type DiceRollArea = {
  /** Centro da área, no plano XZ (o Y é a altura de soltura). */
  center: Vector3;
  /** Extensão a partir do centro, em X e Z. */
  halfWidth: number;
  halfDepth: number;
};

/**
 * Gerador pseudoaleatório semeado (mulberry32).
 *
 * Existe para a sincronização da rolagem sobre a grid: quem rola transmite apenas uma
 * semente, e cada cliente reconstrói a MESMA sequência de posições,
 * rotações e impulsos. `Math.random` não serve porque não é semeável.
 *
 * O resultado numérico do dado NÃO depende disto: ele continua vindo do
 * `player_state.dice` do emissor — a semente só faz a
 * animação parecer a mesma nas duas telas.
 */
export function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semente nova para uma rolagem local, a ser transmitida aos outros. */
export function newRollSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

/**
 * Valida e limita o payload recebido do broker antes de criar meshes.
 *
 * O broker retransmite o evento sem interpretar (mesma classe de
 * `player_pointer`), então a fronteira de segurança é o cliente que pagaria
 * o custo de uma contagem absurda. Tipos desconhecidos são ignorados; uma
 * rolagem vazia, com seed inválida ou acima do teto global é rejeitada.
 */
export function parseSharedDiceRoll(
  payload: unknown
): SharedDiceRollPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const { counts, seed } = payload as Record<string, unknown>;
  if (
    typeof seed !== "number" ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0x7fffffff ||
    !counts ||
    typeof counts !== "object"
  ) {
    return null;
  }

  const safeCounts: DiceCounts = {};
  let total = 0;
  for (const type of DICE_TYPES) {
    const value = (counts as Record<string, unknown>)[type];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      continue;
    }
    const clamped = Math.min(MAX_DICE_PER_TYPE, Math.floor(value));
    safeCounts[type] = clamped;
    total += clamped;
  }

  if (total === 0 || total > MAX_DICE_TOTAL) {
    return null;
  }

  return { counts: safeCounts, seed };
}

/**
 * Metade da altura/largura visíveis no plano Y=0, para uma câmera olhando
 * de cima (a de `DiceInteraction`: `TargetCamera` em (0, cameraHeight, 0)
 * apontada para a origem).
 *
 * O `fov` do Babylon é VERTICAL por padrão (`FOVMODE_VERTICAL_FIXED`), daí
 * a altura sair direto da tangente e a largura depender do aspecto. É o
 * que permite dimensionar as paredes da arena contra o canvas real em vez
 * de herdar os 10×20 fixos da bandeja antiga — com as paredes maiores que
 * a vista, um dado pode parar fora da tela; com elas menores, ele bate numa
 * parede invisível no meio do mapa.
 */
export function visibleHalfExtents(
  cameraHeight: number,
  fov: number,
  aspectRatio: number
): { halfWidth: number; halfDepth: number } {
  const halfDepth = cameraHeight * Math.tan(fov / 2);
  return { halfWidth: halfDepth * aspectRatio, halfDepth };
}

/**
 * Limita a área de rolagem a uma FRAÇÃO do que a câmera realmente enquadra,
 * não a um valor absoluto fixo — pedido do usuário depois de ver os dados
 * se espalhando quase pela tela inteira mesmo com o teto fixo da primeira
 * tentativa (10 unidades): a essa altura/fov de câmera (`CAMERA_HEIGHT`/
 * `CAMERA_FOV` em `DiceInteraction`/`DiceRollLayer`), a metade-extensão
 * VISÍVEL já gira em torno de ~11 unidades — um teto fixo de 10 mal reduzia
 * a área, porque ficava quase do tamanho da tela toda.
 *
 * Em vez de um número absoluto, a área vira uma fração do menor lado
 * visível — perto de 40% de cada lado da tela, reproduzindo o quadrado
 * delimitado no centro pedido pela referência visual, e continua
 * proporcional corretamente a QUALQUER tamanho de janela/zoom, porque
 * deriva do `visibleHalfExtents` real em vez de uma constante de mundo.
 */
export const DICE_ROLL_AREA_FRACTION = 0.4;

export function squareDiceRollExtents(extents: {
  halfWidth: number;
  halfDepth: number;
}): { halfWidth: number; halfDepth: number } {
  const half =
    Math.min(extents.halfWidth, extents.halfDepth) * DICE_ROLL_AREA_FRACTION;
  return { halfWidth: half, halfDepth: half };
}
