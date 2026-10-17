import type { DiceState } from "./Dice";

/** Everything broadcast about a single connected player — the public
 * half of their session, as opposed to anything kept purely local. */
export interface PlayerState {
  dice: DiceState;
  nickname: string;
  sessionId?: string;
  userId?: string;
  /** The account id behind this connection, when accounts are in
   * use — lets the Party roster (components/party/CharacterRoster.tsx)
   * show which Personagem owners are currently online ("bolinha à
   * direita: conectado agora ou não"). Undefined for builds
   * without accounts (helpers/account.ts's accountsAvailable === false). */
  accountId?: number;
}
