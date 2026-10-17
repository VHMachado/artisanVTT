import type { DiceRollRequest } from "./diceRoll";

/**
 * A cena processa uma rolagem por vez. Quatro pedidos pendentes são o
 * bastante para cliques humanos rápidos sem permitir que uma rajada de rede
 * acumule trabalho de física indefinidamente.
 */
export const MAX_PENDING_DICE_ROLLS = 4;

export type DiceRollQueue = {
  active: DiceRollRequest | null;
  pending: DiceRollRequest[];
};

export function emptyDiceRollQueue(): DiceRollQueue {
  return { active: null, pending: [] };
}

/**
 * Mantém FIFO para rolagens locais e reduz todas as animações remotas
 * pendentes à mais recente. A rolagem que já está na cena não faz parte desta
 * lista, portanto o máximo vivo é uma ativa + quatro pendentes.
 */
export function enqueueDiceRollRequest(
  queue: DiceRollRequest[],
  next: DiceRollRequest
): DiceRollRequest[] {
  if (!next.publishResults) {
    const remoteIndex = queue.findIndex((item) => !item.publishResults);
    if (remoteIndex >= 0) {
      const pending = [...queue];
      pending[remoteIndex] = next;
      return pending;
    }
    if (queue.length >= MAX_PENDING_DICE_ROLLS) {
      return queue;
    }
    return [...queue, next];
  }

  if (queue.length >= MAX_PENDING_DICE_ROLLS) {
    const remoteIndex = queue.findIndex((item) => !item.publishResults);
    if (remoteIndex < 0) {
      return queue;
    }
    const pending = [...queue];
    pending.splice(remoteIndex, 1);
    return [...pending, next];
  }
  return [...queue, next];
}

export function enqueueDiceRoll(
  queue: DiceRollQueue,
  next: DiceRollRequest
): DiceRollQueue {
  if (!queue.active) {
    return { active: next, pending: queue.pending };
  }
  const pending = enqueueDiceRollRequest(queue.pending, next);
  if (pending === queue.pending) {
    return queue;
  }
  return {
    active: queue.active,
    pending,
  };
}

export function completeDiceRoll(
  queue: DiceRollQueue,
  completed: DiceRollRequest
): DiceRollQueue {
  if (queue.active !== completed) {
    return queue;
  }
  return {
    active: queue.pending[0] || null,
    pending: queue.pending.slice(1),
  };
}

/** Erro de carga invalida a cena inteira, não só o pedido corrente. */
export function clearDiceRollQueue(_queue: DiceRollQueue): DiceRollQueue {
  return emptyDiceRollQueue();
}
