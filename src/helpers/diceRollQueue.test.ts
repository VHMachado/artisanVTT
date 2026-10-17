import { describe, expect, test } from "vitest";

import type { DiceRollRequest } from "./diceRoll";
import {
  MAX_PENDING_DICE_ROLLS,
  clearDiceRollQueue,
  enqueueDiceRoll,
  enqueueDiceRollRequest,
} from "./diceRollQueue";

function request(seed: number, publishResults: boolean): DiceRollRequest {
  return { counts: { d20: 1 }, seed, publishResults };
}

describe("enqueueDiceRollRequest", () => {
  test("coalesces a flood of remote rolls to the newest pending animation", () => {
    let queue: DiceRollRequest[] = [];
    for (let seed = 1; seed <= 100; seed += 1) {
      queue = enqueueDiceRollRequest(queue, request(seed, false));
    }

    expect(queue).toHaveLength(1);
    expect(queue[0].seed).toBe(100);
  });

  test("never grows beyond the pending queue limit", () => {
    let queue: DiceRollRequest[] = [];
    for (let seed = 1; seed <= MAX_PENDING_DICE_ROLLS + 10; seed += 1) {
      queue = enqueueDiceRollRequest(queue, request(seed, true));
    }

    expect(queue).toHaveLength(MAX_PENDING_DICE_ROLLS);
    expect(queue.map((item) => item.seed)).toEqual(
      Array.from({ length: MAX_PENDING_DICE_ROLLS }, (_, index) => index + 1)
    );
  });

  test("a local roll can evict a coalesced remote roll when the queue is full", () => {
    let queue = [request(1, false)];
    for (let seed = 2; seed <= MAX_PENDING_DICE_ROLLS; seed += 1) {
      queue.push(request(seed, true));
    }

    const next = enqueueDiceRollRequest(queue, request(999, true));

    expect(next).toHaveLength(MAX_PENDING_DICE_ROLLS);
    expect(next.some((item) => !item.publishResults)).toBe(false);
    expect(next.at(-1)?.seed).toBe(999);
  });

  test("a scene load failure drops active and pending work", () => {
    expect(
      clearDiceRollQueue({
        active: request(1, true),
        pending: [request(2, false), request(3, true)],
      })
    ).toEqual({ active: null, pending: [] });
  });

  test("signals rejection by preserving queue identity when only local work fills it", () => {
    const queue = {
      active: request(1, true),
      pending: Array.from({ length: MAX_PENDING_DICE_ROLLS }, (_, index) =>
        request(index + 2, true)
      ),
    };

    expect(enqueueDiceRoll(queue, request(999, true))).toBe(queue);
  });
});
