import { FogState } from "./Fog";
import { TokenStates } from "./TokenState";

/**
 * `"notes"` saiu da união junto com as notas post-it (o produto
 * inteiro, não só a UI). Um mapState salvo antes dessa remoção
 * ainda carrega a flag na lista; `src/upgrade.ts` v33 a remove de todo
 * registro, e o schema Ajv deixou de aceitá-la.
 */
export type EditFlag = "tokens" | "fog";

/**
 * The map's darkness layer, revealed only where a token's light
 * reaches (types/TokenState.ts's TokenLight, rendered by
 * components/konva/DarknessOverlay.tsx).
 *
 * Lives in MapState, not on Map, because switching the lights off is an
 * act of PLAY, not library configuration: MapState is the versioned
 * channel that broadcasts to every player the moment it changes
 * (map_state/map_state_update), while Map only reaches other clients when
 * the GM re-selects the map entirely — which is why showGrid/snapToGrid,
 * both genuinely static, can afford to live there and this can't.
 *
 * Optional so every map state written before darkness existed reads as "no
 * darkness" with no upgrade.ts version (the stored shape of existing
 * records is unchanged, only extended).
 *
 * Ajuste (2026-10-03): a intensidade configurável foi removida —
 * escuridão é sempre 100% opaca onde não há luz, ponto. `opacity` deixou
 * de existir no tipo; um mapState antigo que ainda carrega esse campo
 * continua validando (o schema Ajv não restringe additionalProperties) e
 * é simplesmente ignorado por todo código que lê MapDarkness agora.
 */
export type MapDarkness = {
  enabled: boolean;
  /**
   * Quão escura a área não iluminada fica, 0..1. 1 é preto total.
   *
   * Removida na primeira rodada de ajustes da escuridão ("escuridão deve
   * ser sempre 100%") e RESTAURADA a pedido do usuário depois — o default
   * continua 1 (opaco), que é o comportamento daquele pedido, mas voltou
   * a ser ajustável. Ausente conta como 1, então todo mapState escrito
   * enquanto o campo não existia lê como escuridão total, sem migração.
   */
  opacity?: number;
  /**
   * A luz de um token para nas "paredes" delimitadas pelo fog
   * (helpers/visibility.ts) em vez de atravessá-las.
   *
   * É um campo e não comportamento fixo porque a geometria do fog é
   * desenhada à mão pelo GM com outro propósito (esconder informação).
   * Num mapa em que o fog acompanha as paredes — o caso que motivou esta
   * feature — tratá-lo como parede é exatamente o certo; num mapa em que o
   * GM cobriu regiões de forma solta, a oclusão produziria sombras que
   * não correspondem a nada no desenho. O GM precisa de uma saída, e ela
   * é uma só: este booleano.
   *
   * Opcional/ausente conta como LIGADO (ver defaultMapDarkness): quem
   * acende a escuridão quer que ela signifique algo, e atravessar parede
   * é o comportamento que foi reportado como errado.
   *
   * Vive dentro de `darkness` de propósito: `hub.go`'s touchesDarkness
   * já trata qualquer path que comece em ["darkness", ...] como GM-only,
   * então este campo herda a mesma autorização sem uma linha de
   * broker nova.
   */
  occlusion?: boolean;
};

/** Used wherever darkness is read, so a map state predating this field (and one
 * whose darkness was never configured) behaves identically. */
export const defaultMapDarkness: MapDarkness = {
  enabled: false,
  opacity: 1,
  occlusion: true,
};

export type MapState = {
  tokens: TokenStates;
  fogs: FogState;
  editFlags: Array<EditFlag>;
  mapId: string;
  /** See MapDarkness above. Undefined means "off". */
  darkness?: MapDarkness;
};
