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

    // Captura o socket ATUAL numa constante local em vez de reler
    // `session.socket` dentro do cleanup: `session.socket` é mutável (uma
    // reconexão/`Session._handleSocketReconnect` o substitui por uma
    // instância NOVA), e o cleanup só roda quando ESTE efeito já
    // reagiu a essa troca — ou seja, `session.socket` no momento do
    // cleanup já é o socket NOVO. Fazer `session.socket?.off(...)` ali
    // removeria o listener do socket errado (o novo, que nunca o teve) e
    // deixaria o listener esquecido no socket antigo.
    const socket = session.socket;
    socket?.on("dice_roll", handleDiceRoll);
    return () => {
      socket?.off("dice_roll", handleDiceRoll);
    };
    // `session.socket` precisa estar nas deps, não só `session`: o objeto
    // Session é um singleton estável (routes/Game.tsx's `useState(new
    // Session())`) que NUNCA muda de identidade, mas `session.socket` é
    // `undefined` até `session.connect()` resolver — e esse connect roda
    // num efeito SEPARADO (useSessionConnection), gated em
    // `isAccountLoaded`, que só fica true bem depois do primeiro render.
    // Com deps `[session]` (como estava antes), este efeito corria UMA
    // vez, no mount, via `session.socket?.on(...)` sobre um `socket`
    // ainda `undefined` — o optional chaining engolia a chamada em
    // silêncio, nenhum listener real era anexado, e como `session` nunca
    // muda de identidade o efeito nunca rodava de novo para anexar no
    // socket real depois que `connect()` o criava. O dice_roll chegava
    // pela rede (confirmado via WebSocket bruto) mas nenhum handler
    // JS jamais era chamado — silencioso tanto no Espectador quanto no
    // Jogador comum assistindo a rolagem de outro, porque os dois passam
    // por este mesmo hook. Mesma convenção que
    // `useNetworkedState.ts`'s `useSyncIncomingState` já usa
    // (`[session.socket, ...]`).
  }, [session, session.socket]);

  return roll;
}

export default useSharedDiceRolls;
