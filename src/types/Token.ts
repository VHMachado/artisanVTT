import Konva from "konva";
import { Outline } from "./Outline";

export type TokenCategory = "attachment" | "prop" | "vehicle" | "character";
export interface BaseToken {
  outline: Outline;
  lastModified: number;
  created: number;
  owner: string;
  height: number;
  width: number;
  hideInSidebar: boolean;
  defaultLabel: string;
  defaultCategory: TokenCategory;
  defaultSize: number;
  name: string;
  id: string;
}
export type DefaultToken = BaseToken & { key: string; type: "default" };
export type FileToken = BaseToken & { thumbnail: string; file: string; type: "file" };
export type Token = FileToken | DefaultToken;
export interface TokenMenuOptions {
  focus: boolean;
  tokenImage: Konva.Node;
  tokenStateId: string;
}
export interface TokenDraggingOptions {
  attachedTokenStateIds: string[];
  tokenStateId: string;
  dragging: boolean;
}
