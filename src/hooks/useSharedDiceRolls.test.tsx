import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it } from "vitest";

import EventEmitter from "../helpers/EventEmitter";
import useSharedDiceRolls from "./useSharedDiceRolls";
import type Session from "../network/Session";

/**
 * `session.socket` is `undefined` until `Session.connect()` resolves —
 * which happens in a SEPARATE effect (routes/Game.tsx's
 * useSessionConnection), gated behind account loading, well after a
 * component using this hook first mounts. The real `Session` instance
 * itself never changes identity (`useState(new Session())`), only its
 * `.socket` property gets assigned later. A fake with the same shape
 * reproduces that exact timing without needing a real Session/WsClient.
 */
function makeFakeSession(): { socket?: EventEmitter } {
  return { socket: undefined };
}

describe("useSharedDiceRolls", () => {
  it("attaches to the real socket once it appears after mount, not only at mount time", () => {
    const session = makeFakeSession();
    let lastRoll: ReturnType<typeof useSharedDiceRolls> = null;

    function Harness({ session }: { session: { socket?: EventEmitter } }) {
      lastRoll = useSharedDiceRolls(session as unknown as Session);
      return null;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);

    // Monta ANTES do socket existir — exatamente a janela em que o
    // `connect()` ainda não resolveu.
    act(() => {
      ReactDOM.render(<Harness session={session} />, container);
    });
    expect(session.socket).toBeUndefined();

    // `connect()` resolve: a MESMA instância de Session ganha um socket
    // real, sem nunca trocar de identidade.
    const fakeSocket = new EventEmitter();
    session.socket = fakeSocket;

    // Qualquer re-render subsequente (o app inteiro re-renderiza por
    // dezenas de outros motivos) precisa bastar para o efeito reparar o
    // listener — não deve exigir desmontar/remontar o componente.
    act(() => {
      ReactDOM.render(<Harness session={session} />, container);
    });

    act(() => {
      fakeSocket.emit("dice_roll", { counts: { d20: 1 }, seed: 42 });
    });

    expect(lastRoll).toEqual({ counts: { d20: 1 }, seed: 42 });

    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
  });

  it("stops forwarding events from a socket that was replaced", () => {
    const session: { socket?: EventEmitter } = { socket: new EventEmitter() };
    let lastRoll: ReturnType<typeof useSharedDiceRolls> = null;

    function Harness({ session }: { session: { socket?: EventEmitter } }) {
      lastRoll = useSharedDiceRolls(session as unknown as Session);
      return null;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const firstSocket = session.socket as EventEmitter;

    act(() => {
      ReactDOM.render(<Harness session={session} />, container);
    });

    // Reconexão (Session._handleSocketReconnect/connect) troca o socket
    // por uma instância nova.
    const secondSocket = new EventEmitter();
    session.socket = secondSocket;
    act(() => {
      ReactDOM.render(<Harness session={session} />, container);
    });

    act(() => {
      firstSocket.emit("dice_roll", { counts: { d20: 1 }, seed: 1 });
    });
    expect(lastRoll).toBeNull();

    act(() => {
      secondSocket.emit("dice_roll", { counts: { d12: 1 }, seed: 2 });
    });
    expect(lastRoll).toEqual({ counts: { d12: 1 }, seed: 2 });

    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
  });
});
