import Vector2 from "./Vector2";
import { Fog } from "../types/Fog";

/**
 * Visibilidade 2D (polígono de visibilidade / raycasting) para
 * que a luz de um token pare nas "paredes" delimitadas pelo fog of war.
 *
 * Puro: sem React, sem Konva, sem Dexie — é função dos segmentos de fog
 * mais a posição/raio da luz, então todo o conjunto de regras é
 * unit-testável, mesma disciplina de `helpers/light.ts`.
 *
 * Por que as arestas do FOG são as paredes: este app não tem uma camada
 * de parede própria (nem o upstream Owlbear Rodeo 1.0 tinha). O que o GM
 * já desenha à mão é o fog — "o que está escondido" — e a fronteira entre
 * área coberta e área revelada é, na prática, exatamente onde o jogador
 * entende que existe uma parede. Reaproveitar essa geometria evita pedir
 * ao GM que desenhe o mapa duas vezes (uma de fog, uma de paredes), que é
 * o custo que faz oclusão de luz ser abandonada na maioria das mesas.
 */

/** Um segmento bloqueador, em PIXELS do mapa (não normalizado). */
export type Segment = { a: Vector2; b: Vector2 };

/**
 * Quantos graus entre dois raios "de preenchimento".
 *
 * Os raios lançados nos vértices dos segmentos dão os cantos EXATOS da
 * sombra, mas entre dois cantos distantes sem nada bloqueando o polígono
 * seria fechado por uma corda reta, encolhendo visivelmente o disco de
 * luz (uma luz sem nenhuma parede perto viraria um polígono de 3-4 lados
 * em vez de um círculo). Uma grade angular fixa garante que o contorno
 * livre continue lendo como arco: 6° → até 60 lados no círculo completo,
 * indistinguível de uma circunferência no zoom de jogo.
 */
const ANGULAR_STEP_DEGREES = 6;

/**
 * Desvio angular aplicado de cada lado de um vértice.
 *
 * Um raio que acerta um vértice exatamente é ambíguo: ele tanto para ali
 * quanto deveria seguir até o que estiver atrás. Lançar também em
 * `ângulo ± EPS` resolve os dois casos sem caso especial — o raio de
 * dentro para na quina, o de fora segue e encontra o fundo, e o par
 * define a aresta reta da sombra. 1e-4 rad em um raio de 300px desloca
 * 0.03px lateralmente: suficiente para escapar do vértice e invisível.
 */
const VERTEX_ANGLE_EPSILON = 1e-4;

/** Abaixo disto o raio e o segmento são tratados como paralelos. */
const PARALLEL_EPSILON = 1e-12;

const TWO_PI = Math.PI * 2;

/**
 * Extrai todos os segmentos bloqueadores de uma lista de fogs.
 *
 * Só fog `visible` bloqueia: um fog oculto é justamente o que o GM
 * desligou (ver `FogTool.tsx`'s toggle), então deixar de ser parede é o
 * comportamento coerente com "a área foi aberta".
 *
 * Tanto o anel externo (`data.points`) quanto cada buraco (`data.holes`)
 * entram, e cada anel é FECHADO (último ponto liga no primeiro): a
 * fronteira de um buraco é tão parede quanto a borda externa — é
 * exatamente o caso de uma sala vazada dentro de uma mancha de fog.
 *
 * `mapSize` converte de normalizado (como o fog é armazenado) para pixels
 * do mapa, o mesmo espaço em que `DarknessOverlay` desenha.
 */
export function fogSegments(fogs: Fog[], mapSize: Vector2): Segment[] {
  const segments: Segment[] = [];
  for (const fog of fogs) {
    if (!fog.visible) {
      continue;
    }
    pushRing(segments, fog.data.points, mapSize);
    for (const hole of fog.data.holes) {
      pushRing(segments, hole, mapSize);
    }
  }
  return segments;
}

function pushRing(out: Segment[], ring: Vector2[], mapSize: Vector2): void {
  if (ring.length < 2) {
    return;
  }
  for (let i = 0; i < ring.length; i++) {
    const from = ring[i];
    const to = ring[(i + 1) % ring.length];
    const a = { x: from.x * mapSize.x, y: from.y * mapSize.y };
    const b = { x: to.x * mapSize.x, y: to.y * mapSize.y };
    // Descarta segmento degenerado: não bloqueia nada e só custaria um
    // teste de interseção por raio.
    if (a.x === b.x && a.y === b.y) {
      continue;
    }
    out.push({ a, b });
  }
}

/**
 * Mantém só os segmentos que podem influenciar uma luz em `origin` com
 * raio `radius`.
 *
 * Teste de AABB (caixa do segmento × caixa do disco), não distância exata
 * ponto-segmento: é mais barato, nunca descarta um segmento que importa
 * (só aceita alguns a mais, nos cantos da caixa), e é o filtro que faz um
 * mapa com fog complexo continuar viável — sem ele o custo seria
 * proporcional a TODO o fog do mapa em vez de ao que está perto da luz.
 */
export function segmentsNearLight(
  segments: Segment[],
  origin: Vector2,
  radius: number
): Segment[] {
  const minX = origin.x - radius;
  const maxX = origin.x + radius;
  const minY = origin.y - radius;
  const maxY = origin.y + radius;
  return segments.filter((seg) => {
    const segMinX = Math.min(seg.a.x, seg.b.x);
    if (segMinX > maxX) return false;
    const segMaxX = Math.max(seg.a.x, seg.b.x);
    if (segMaxX < minX) return false;
    const segMinY = Math.min(seg.a.y, seg.b.y);
    if (segMinY > maxY) return false;
    const segMaxY = Math.max(seg.a.y, seg.b.y);
    if (segMaxY < minY) return false;
    return true;
  });
}

/**
 * Distância do primeiro ponto em que o raio `origin + t*direction`
 * encontra o segmento, ou `undefined` se não encontra.
 *
 * `direction` precisa estar normalizado para que o `t` devolvido seja
 * distância em pixels (é o que o chamador compara com o raio da luz).
 */
export function raySegmentDistance(
  origin: Vector2,
  direction: Vector2,
  segment: Segment
): number | undefined {
  const sx = segment.b.x - segment.a.x;
  const sy = segment.b.y - segment.a.y;
  const det = sx * direction.y - direction.x * sy;
  if (Math.abs(det) < PARALLEL_EPSILON) {
    return undefined;
  }
  const wx = segment.a.x - origin.x;
  const wy = segment.a.y - origin.y;
  // u = posição ao longo do segmento (precisa cair em [0,1]);
  // t = distância ao longo do raio (precisa ser >= 0).
  const u = (direction.x * wy - wx * direction.y) / det;
  if (u < 0 || u > 1) {
    return undefined;
  }
  const t = (sx * wy - wx * sy) / det;
  if (t < 0) {
    return undefined;
  }
  return t;
}

export type VisibilityOptions = {
  /** Início do setor, em radianos (convenção do canvas: 0 = direita, o
   * ângulo cresce no sentido horário na tela porque y cresce para baixo —
   * a mesma de `coneRotation` em `helpers/light.ts`). Ausente = 360°. */
  startAngle?: number;
  /** Abertura do setor em radianos. Ignorado sem `startAngle`. */
  angleSpan?: number;
};

/**
 * O polígono iluminado: a área que a luz em `origin` alcança dentro de
 * `radius` sem atravessar nenhum segmento.
 *
 * Devolve os vértices em ordem de ângulo CRESCENTE (horário na tela). Em
 * setor (cone) o `origin` é incluído como primeiro vértice, fechando a
 * cunha; em 360° o contorno já é fechado por si.
 *
 * Um array vazio significa "nada a desenhar" (raio <= 0).
 *
 * Algoritmo: varredura por ângulo lançando raios (a) nos vértices de cada
 * segmento relevante, ± um epsilon para resolver as quinas, e (b) numa
 * grade angular fixa que mantém o contorno livre arredondado. Preferido a
 * `polygonClipping.difference` (a abordagem do fog) porque o custo deste
 * é proporcional ao fog PERTO da luz, não ao número total de vértices do
 * mapa — e porque devolve direto o anel que `DarknessOverlay` precisa
 * desenhar como furo.
 */
export function visibilityPolygon(
  origin: Vector2,
  radius: number,
  segments: Segment[],
  options: VisibilityOptions = {}
): Vector2[] {
  if (radius <= 0) {
    return [];
  }

  const relevant = segmentsNearLight(segments, origin, radius);

  const isSector =
    typeof options.startAngle === "number" &&
    typeof options.angleSpan === "number" &&
    options.angleSpan < TWO_PI;
  const startAngle = options.startAngle ?? 0;
  const span = isSector ? (options.angleSpan as number) : TWO_PI;

  // Offsets a partir de startAngle, sempre em [0, span]. Trabalhar com
  // offsets em vez de ângulos absolutos evita todo o cuidado com o
  // wrap-around em -π/+π no meio de um cone.
  const offsets: number[] = [];
  const pushOffset = (offset: number) => {
    if (offset >= 0 && offset <= span) {
      offsets.push(offset);
    }
  };

  // (a) grade angular fixa, mantendo o contorno livre suave.
  const step = (ANGULAR_STEP_DEGREES * Math.PI) / 180;
  for (let offset = 0; offset < span; offset += step) {
    pushOffset(offset);
  }
  // As duas bordas exatas do setor (ou o fechamento do círculo) precisam
  // existir mesmo que não caiam na grade.
  pushOffset(0);
  pushOffset(span);

  // (b) raios nos vértices, ± epsilon para as quinas.
  for (const seg of relevant) {
    for (const point of [seg.a, seg.b]) {
      const angle = Math.atan2(point.y - origin.y, point.x - origin.x);
      const base = normalizeOffset(angle - startAngle);
      pushOffset(base - VERTEX_ANGLE_EPSILON);
      pushOffset(base);
      pushOffset(base + VERTEX_ANGLE_EPSILON);
    }
  }

  offsets.sort((l, r) => l - r);

  const points: Vector2[] = [];
  if (isSector) {
    // O ápice da cunha. Sem ele o cone viraria um polígono "flutuante"
    // ligando as duas bordas por uma corda.
    points.push({ x: origin.x, y: origin.y });
  }

  let previousOffset = Number.NaN;
  for (const offset of offsets) {
    // Ângulos praticamente idênticos (o mesmo vértice visto por dois
    // segmentos que o compartilham) renderiam vértices duplicados.
    if (
      Number.isFinite(previousOffset) &&
      Math.abs(offset - previousOffset) < VERTEX_ANGLE_EPSILON / 10
    ) {
      continue;
    }
    previousOffset = offset;

    const angle = startAngle + offset;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };

    let distance = radius;
    for (const seg of relevant) {
      const hit = raySegmentDistance(origin, direction, seg);
      if (hit !== undefined && hit < distance) {
        distance = hit;
      }
    }

    points.push({
      x: origin.x + direction.x * distance,
      y: origin.y + direction.y * distance,
    });
  }

  return points;
}

/** Traz um delta angular qualquer para [0, 2π). */
function normalizeOffset(angle: number): number {
  const wrapped = angle % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

/**
 * Assinatura estável dos segmentos, para entrar na `maskSignature` que
 * governa o cache do `DarknessOverlay`.
 *
 * Sem isto o cache do Konva não saberia que o fog mudou e continuaria
 * exibindo a sombra da parede antiga — exatamente o bug "esqueci de
 * chamar cache() de novo" que a invalidação declarativa do fog evita.
 * Arredonda para 1 decimal: movimento sub-pixel de fog não
 * muda nada visível e não vale uma rasterização nova.
 */
export function segmentsSignature(segments: Segment[]): string {
  return segments
    .map(
      (seg) =>
        `${seg.a.x.toFixed(1)},${seg.a.y.toFixed(1)},${seg.b.x.toFixed(
          1
        )},${seg.b.y.toFixed(1)}`
    )
    .join(";");
}
