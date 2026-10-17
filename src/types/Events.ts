import Konva from "konva";
import { DefaultDice, DiceRoll } from "./Dice";
import { Map } from "./Map";
import { MapState } from "./MapState";
import { Token } from "./Token";
import { TokenState } from "./TokenState";

type VoidHandler<Args extends unknown[] = []> = (...args: Args) => void;
export type MapChangeEventHandler = VoidHandler<[
  map: Map | null,
  mapState: MapState | null,
]>;
export type MapResetEventHandler = VoidHandler<[newState: MapState]>;
export type MapSettingsChangeEventHandler = VoidHandler<[change: Partial<Map>]>;
export type MapStateSettingsChangeEventHandler = VoidHandler<[
  change: Partial<MapState>,
]>;
export type DiceSelectEventHandler = VoidHandler<[dice: DefaultDice]>;
export type RequestCloseEventHandler = VoidHandler;
export type TokensStateCreateHandler = VoidHandler<[states: TokenState[]]>;
export type TokenStateRemoveHandler = VoidHandler<[tokenStateIds: string[]]>;
export type TokenStateChangeEventHandler = VoidHandler<[
  changes: Record<string, Partial<TokenState>>,
]>;
export type TokenMenuOpenChangeEventHandler = VoidHandler<[
  tokenStateId: string,
  tokenImage: Konva.Node,
  focus: boolean,
]>;
export type TokenMenuCloseChangeEventHandler = VoidHandler;
export type TokenMonsterMenuOpenEventHandler = VoidHandler<[
  tokenStateId: string,
  clientX: number,
  clientY: number,
]>;
export type TokenMonsterMenuCloseEventHandler = VoidHandler;
export type TokenSettingsChangeEventHandler = VoidHandler<[change: Partial<Token>]>;
export type TokenDragEventHandler = VoidHandler<[
  event: Konva.KonvaEventObject<DragEvent>,
  tokenStateId: string,
  attachedTokenStateIds: string[],
]>;
export type DiceShareChangeEventHandler = VoidHandler<[share: boolean]>;
export type DiceRollsChangeEventHandler = VoidHandler<[newRolls: DiceRoll[]]>;
export type SelectionItemsChangeEventHandler = VoidHandler<[
  tokenChanges: Record<string, Partial<TokenState>>,
]>;
export type SelectionItemsRemoveEventHandler = VoidHandler<[tokenStateIds: string[]]>;
export type SelectionItemsCreateEventHandler = VoidHandler<[tokenStates: TokenState[]]>;
export type CustomTransformEventHandler = VoidHandler<[
  event: Konva.KonvaEventObject<Event>,
  attachments: Konva.Node[],
]>;
