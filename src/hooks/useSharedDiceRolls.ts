import { useEffect, useState } from "react";

import Session from "../network/Session";
import {
  parseSharedDiceRoll,
  type SharedDiceRollPayload,
} from "../helpers/diceRoll";

/**
 * Recebe a rolagem de dados de outro jogador para que a
 * mesma rolagem apareça nesta tela.
 *
 * Trafega só `{counts, seed}` — nada de física. Cada cliente reconstrói o
 * arremesso a partir da semente (helpers/diceRoll.ts's `seededRandom`),
 * porque mandar posição/rotação de N dados a 60fps seria ordens de
 * grandeza mais tráfego para um efeito puramente visual.
 *
 * O NÚMERO não vem daqui: continua chegando pelo `player_state.dice` do
 * emissor, como sempre (a física mediu-se atratora, mas
 * o contrato é que a animação é cosmética e o valor é do emissor). Então uma
 * divergência de trajetória é no máximo um detalhe visual, nunca um número
 * errado na mesa.
 *
 * Não recebe `shareDice` de propósito: a preferência governa o que ESTE
 * cliente envia. Quem a desliga escolhe esconder as próprias rolagens, não
 * deixar de ver as dos outros — a mesma semântica de `player_state.dice`
 * anterior a esta fase.
 */
function useSharedDiceRolls(session: Session): SharedDiceRollPayload | null {
  const [roll, setRoll] = useState<SharedDiceRollPayload | null>(null);

  useEffect(() => {
    function handleDiceRoll(payload: unknown) {
      // O payload vem da rede: validar antes de alimentar a física. Um
      // `counts` com tipo desconhecido ou contagem absurda criaria malhas
      // demais (ou nenhuma) e só apareceria como travamento.
      const parsed = parseSharedDiceRoll(payload);
      if (parsed) {
        setRoll(parsed);
      }
    }

    session.socket?.on("dice_roll", handleDiceRoll);
    return () => {
      session.socket?.off("dice_roll", handleDiceRoll);
    };
  }, [session]);

  return roll;
}

export default useSharedDiceRolls;
