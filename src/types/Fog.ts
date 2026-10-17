import Vector2 from "../helpers/Vector2";
import { Color } from "../helpers/colors";

/**
 * As cinco formas que o Mestre pode usar para cobrir/revelar o mapa.
 * "toggle"/"remove" não desenham nada novo — agem sobre o fog já
 * existente sob o cursor (ligar/desligar visibilidade e apagar,
 * respectivamente).
 */
export type FogToolType = "polygon" | "rectangle" | "brush" | "toggle" | "remove";
export interface FogToolSettings {
  type: FogToolType;
  /** Quando falso, uma forma nova é recortada contra as formas existentes
   * antes de ser adicionada (o comportamento "uma camada só" de fog). */
  multilayer: boolean;
  /** Visão do Jogador: nenhuma edição, só o fog revelado. */
  preview: boolean;
  /** Em vez de somar área coberta, a forma desenhada CORTA (revela) o
   * fog que ela sobrepõe — ver `CutFogAction`. */
  useFogCut: boolean;
}
/**
 * Um polígono com buracos: `points` é o anel externo, cada entrada de
 * `holes` é um anel interno (uma área revelada DENTRO de uma área
 * coberta — ex. o resultado de um corte). Coordenadas normalizadas
 * (0..1 em cada eixo, relativas ao tamanho do mapa), mesma convenção que
 * `TokenState`/`Drawing` já usam.
 */
export interface FogData {
  points: Vector2[];
  holes: Vector2[][];
}
export interface Fog {
  id: string;
  type: "fog";
  color: Color;
  strokeWidth: number;
  data: FogData;
  /** Falso = o Mestre desligou esta forma sem apagá-la (ela continua lá,
   * mas não cobre nada para o Jogador) — ver o modo "toggle" acima. */
  visible: boolean;
}
export type FogState = Record<string, Fog>;
