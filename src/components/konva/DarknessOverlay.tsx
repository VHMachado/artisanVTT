import { useEffect, useMemo, useRef } from "react";
import { Group, Shape } from "react-konva";
import Konva from "konva";

import {
  useMapWidth,
  useMapHeight,
} from "../../contexts/MapInteractionContext";
import { useGridCellPixelSize } from "../../contexts/GridContext";

import colors from "../../helpers/colors";
import {
  coneRotation,
  isLightActive,
  lightPixelRadius,
  normalizeMapDarkness,
  normalizeTokenLight,
} from "../../helpers/light";
import {
  fogSegments,
  segmentsSignature,
  visibilityPolygon,
} from "../../helpers/visibility";
import type { Segment } from "../../helpers/visibility";

import { MapState } from "../../types/MapState";
import { TokenLight } from "../../types/TokenState";

/** One light reduced to the pixel geometry the mask needs. */
type LightHole = {
  id: string;
  x: number;
  y: number;
  radius: number;
  light: TokenLight;
  rotation: number;
};

/**
 * Resolution the mask bitmap is rasterised at, relative to map pixels.
 *
 * Measured, not guessed: rasterising the holes scales with the lit AREA,
 * so the only effective lever is rasterising fewer pixels. The mask's
 * edges don't need to be pixel-perfect, so half resolution (a quarter of
 * the pixels) upscales with hardware bilinear filtering at no visible
 * cost.
 */
const MASK_PIXEL_RATIO = 0.5;

/** Hard ceiling on the cache bitmap's longest side, in device pixels, so
 * a very large map can't allocate an enormous offscreen canvas. Past this
 * the effective pixel ratio shrinks further, which is harmless — the mask
 * only gets softer. */
const MAX_MASK_DIMENSION = 2048;

type DarknessOverlayProps = {
  mapState: MapState;
  /** True while this client may edit the map (the Mestre, never the
   * Espectador — Map.tsx computes it). The GM sees the darkness at
   * reduced opacity so they can still work under it, the same compromise
   * fog.editOpacity already makes for fog. */
  editable: boolean;
};

/**
 * The map's darkness, revealed wherever a token's light reaches.
 *
 * The lit areas are reverse-wound sub-paths of one big darkness path, the
 * same hole technique components/konva/Fog.tsx already uses ("holes should
 * be wound in the opposite direction as the containing points array"), and
 * the whole group is cached as a reduced-resolution bitmap (see
 * MASK_PIXEL_RATIO).
 *
 * Two alternatives were rejected on purpose:
 *
 * - `polygonClipping.difference(darkness, lights)`, i.e. the fog
 *   machinery's approach: its cost scales with vertex count, and the fog
 *   only pays it once, on dragEnd. Darkness has to be correct on every
 *   frame of a pan/zoom, which is exactly the kind of per-frame workload
 *   that's worth avoiding in JS. Filling a vector path is far cheaper
 *   than computing a boolean polygon op per frame.
 * - `globalCompositeOperation: "destination-out"` to punch the holes:
 *   Konva shapes draw onto their LAYER's canvas, and this overlay shares
 *   one layer with the map image and every token (see
 *   components/map/MapInteraction.tsx), so destination-out would erase
 *   the map itself, not just this group's darkness.
 *
 * The light no longer passes through obstacles. The "paredes" são as
 * arestas dos polígonos de fog visíveis (`helpers/visibility.ts`'s
 * fogSegments) — o app não tem camada de parede própria, e a fronteira do
 * fog é, na prática, onde a mesa entende que existe parede. O fog
 * continua resolvendo "não dá para ver a sala ao lado"; a escuridão agora
 * resolve "a tocha não ilumina atravessando a parede".
 *
 * Known behaviour, not a bug: a light only moves once its token's drag is
 * COMMITTED. Token.tsx writes position imperatively to the Konva node
 * mid-drag and only pushes it into mapState on dragEnd (so the versioned
 * map_state isn't flooded with one write per pixel), and this overlay
 * reads mapState — so dragging a torch slides the token immediately and
 * the glow follows on drop. The caching below neither causes nor worsens
 * that; it predates it.
 *
 * Ajuste pós-lançamento: a penumbra (gradiente radial entre um raio claro
 * e um raio de "meia-luz" mais largo) foi REMOVIDA a pedido do usuário —
 * `TokenLight` não tem mais `dimRadius`. Cada luz agora é um
 * corte rígido no `radius` configurado: dentro, 100% claro; fora, 100%
 * escuro. Mais simples, e sem o artefato que o gradiente antigo tinha
 * (duas penumbras se sobrepondo liam mais escuras que uma luz só).
 *
 * A INTENSIDADE da escuridão (`MapDarkness.opacity`) foi removida no
 * mesmo pedido e depois restaurada, também a pedido do usuário — ela
 * continua aplicada no composite da bitmap em cache (ver maskSignature
 * abaixo), então mexer no slider não custa uma rasterização nova.
 *
 * Também corrigido no mesmo pedido: a cor usada para a escuridão era o
 * preto puro `#000000`, diferente do cinza-escuro `colors.black`
 * (`rgb(34,34,34)`) que `FogTool.tsx` usa como cor padrão do fog ainda
 * não revelado. Como a área "sem fog, com escuridão" lia preto puro bem
 * ao lado de fog-ainda-ativo em cinza-escuro, a fronteira entre as duas
 * ficava visível como um contorno demarcando exatamente a forma da área
 * já revelada — informação que o Jogador não deveria ter (a visão não
 * deveria denunciar onde o fog já foi apagado antes de a luz chegar lá).
 * Usar a MESMA cor do fog aqui faz a escuridão se misturar visualmente
 * com fog não revelado, sem denunciar a forma da área revelada.
 *
 * A luz agora PARA nas paredes delimitadas pelo fog, em vez de
 * atravessá-las. O comentário acima dizia que "light passes through
 * walls" era escolha deliberada porque oclusão exigiria raycasting por
 * frame — um custo que parecia proibitivo para JS puro. A medição refutou
 * esse custo (8 luzes com 125 paredes = 0.7ms, contra 0.3ms do círculo
 * puro), então a oclusão entrou em JS puro: cada furo deixou de ser um
 * `arc` e passou a ser o polígono de visibilidade devolvido por
 * `helpers/visibility.ts`.
 */
function DarknessOverlay({ mapState, editable }: DarknessOverlayProps) {
  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const gridCellPixelSize = useGridCellPixelSize();

  const darkness = normalizeMapDarkness(mapState.darkness);

  // The same min-of-width/height reduction Token.tsx uses to size a
  // token, so a 1-cell light matches the token sitting in that cell
  // instead of stretching with a non-square grid's aspect ratio.
  const cellSize = Math.min(gridCellPixelSize.width, gridCellPixelSize.height);

  // Deliberately NOT useMemo'd on `mapState.tokens`: a PARTIAL update
  // received over the socket (useNetworkedState's handleSocketUpdateEvent,
  // see helpers/diff.ts's applyChanges) mutates the existing tokens object
  // graph IN PLACE rather than replacing it, so `mapState.tokens` keeps the
  // exact same object reference across every partial update after the
  // initial full sync. A useMemo keyed on that reference would then never
  // recompute for a Jogador/Espectador client receiving a token's new
  // position — only the token's own x/y (read fresh every render, with no
  // memoization) would visually move, while this overlay's lights stayed
  // frozen at wherever they were on the last FULL `map_state` sync (a
  // reload, which replaces the whole object graph). The GM's own window
  // never showed this because its local edits go through useMapActions'
  // Action.execute, which clones the state before mutating it, so the
  // reference always changes there. Recomputing `holes` on every render is
  // cheap (a plain map/filter over the token list, not the Konva
  // cache/gradient work that IS expensive and still only reruns via the
  // maskSignature-gated effect below).
  const holes: LightHole[] = Object.values(mapState.tokens)
    .filter((tokenState) => isLightActive(tokenState.light))
    .map((tokenState) => {
      const light = normalizeTokenLight(tokenState.light);
      return {
        id: tokenState.id,
        x: tokenState.x * mapWidth,
        y: tokenState.y * mapHeight,
        radius: lightPixelRadius(light, cellSize),
        light,
        rotation: tokenState.rotation,
      };
    })
    .filter((hole) => hole.radius > 0);

  // As paredes que a luz não atravessa. Mesma razão de não
  // memoizar que `holes` acima: `mapState.fogs` é mutado em lugar pelos
  // updates parciais do socket, então um useMemo na sua referência nunca
  // invalidaria para Jogador/Espectador (foi exatamente esse o bug da luz
  // congelada). Só é calculado quando a oclusão está ligada — com ela
  // desligada o custo é zero, nem o fog é percorrido.
  const occlusionEnabled = darkness.occlusion !== false;
  const walls: Segment[] =
    darkness.enabled && occlusionEnabled
      ? fogSegments(Object.values(mapState.fogs), {
          x: mapWidth,
          y: mapHeight,
        })
      : [];

  // A intensidade voltou a ser configurável (pedido do usuário depois de
  // ter pedido a remoção): o valor escolhido pelo GM multiplica a
  // concessão de trabalho dele próprio, que vê a área não iluminada mais
  // clara para conseguir editar por baixo — mesmo compromisso que
  // fog.editOpacity já faz.
  const opacity = (darkness.opacity ?? 1) * (editable ? 0.6 : 1);

  // Every input the cached bitmap depends on, flattened to a string so it
  // can drive the re-cache effect's dependency array. Invalidation is
  // DECLARATIVE on purpose: the usual stale-bitmap hazard of Konva's
  // cache() is "somebody forgot to call cache() again after a change",
  // and a signature derived from the same values sceneFunc reads can't
  // forget. Note `opacity` is deliberately absent — it's applied to the
  // cached bitmap at composite time, so dragging the intensity slider is
  // a cheap re-composite instead of a full re-rasterisation.
  const maskSignature = useMemo(
    () =>
      [
        mapWidth,
        mapHeight,
        darkness.enabled ? 1 : 0,
        // O fog faz parte do que a máscara desenha agora, então
        // precisa entrar aqui — sem isto o bitmap em cache continuaria
        // mostrando a sombra da parede antiga depois de o GM editar o
        // fog, que é o clássico "esqueci de chamar cache() de novo" que a
        // invalidação declarativa existe para impedir.
        segmentsSignature(walls),
        ...holes.map((hole) =>
          [
            hole.x,
            hole.y,
            hole.radius,
            hole.light.shape,
            hole.light.angle,
            hole.rotation,
          ].join(",")
        ),
      ].join("|"),
    [mapWidth, mapHeight, darkness.enabled, holes, walls]
  );

  const groupRef = useRef<Konva.Group>(null);
  useEffect(() => {
    const group = groupRef.current;
    if (!group || !darkness.enabled || mapWidth <= 0 || mapHeight <= 0) {
      return;
    }
    const longestSide = Math.max(mapWidth, mapHeight);
    const pixelRatio = Math.min(
      MASK_PIXEL_RATIO,
      MAX_MASK_DIMENSION / longestSide
    );
    // The cache region is the MAP, not the group's own bounding box: a
    // light near an edge could otherwise grow the bitmap and shift its
    // origin away from the map's.
    group.cache({
      x: 0,
      y: 0,
      width: mapWidth,
      height: mapHeight,
      pixelRatio,
    });
    group.getLayer()?.batchDraw();
    return () => {
      group.clearCache();
    };
  }, [maskSignature, darkness.enabled, mapWidth, mapHeight]);

  // Placed after every hook above so the hook call order never changes
  // between renders (Rules of Hooks) — same discipline as MapControls'
  // own isSpectator guard.
  if (!darkness.enabled) {
    return null;
  }

  function sceneFunc(context: Konva.Context, shape: Konva.Shape) {
    context.beginPath();
    // The darkness itself, wound clockwise.
    context.moveTo(0, 0);
    context.lineTo(mapWidth, 0);
    context.lineTo(mapWidth, mapHeight);
    context.lineTo(0, mapHeight);
    context.closePath();
    // Cada área iluminada como furo, com winding invertido para que a
    // regra non-zero padrão a recorte do retângulo acima.
    //
    // O furo é o POLÍGONO DE VISIBILIDADE da luz, não mais um
    // arco — é o que faz a luz parar na parede. Com a oclusão desligada
    // `walls` é vazio e `visibilityPolygon` devolve a aproximação
    // poligonal do próprio disco/cunha, então o mesmo caminho de código
    // serve aos dois modos (sem um branch de desenho duplicado que
    // poderia divergir).
    for (let hole of holes) {
      const isCone = hole.light.shape === "cone";
      const polygon = visibilityPolygon(
        { x: hole.x, y: hole.y },
        hole.radius,
        walls,
        isCone
          ? {
              startAngle: toRadians(
                coneRotation(hole.rotation, hole.light.angle)
              ),
              angleSpan: toRadians(hole.light.angle),
            }
          : {}
      );
      if (polygon.length < 3) {
        continue;
      }
      // Percorrido ao CONTRÁRIO: visibilityPolygon devolve em ângulo
      // crescente (horário na tela), e o retângulo da escuridão acima
      // também é horário — desenhar o furo na mesma direção somaria em
      // vez de recortar.
      const last = polygon[polygon.length - 1];
      context.moveTo(last.x, last.y);
      for (let i = polygon.length - 2; i >= 0; i--) {
        context.lineTo(polygon[i].x, polygon[i].y);
      }
      context.closePath();
    }
    context.fillShape(shape);
  }

  return (
    // listening={false}: the overlay must never swallow a click meant for
    // a token or fog shape underneath it.
    <Group ref={groupRef} listening={false} opacity={opacity}>
      <Shape
        // Same color FogTool.tsx's default fog shape uses (colors.black,
        // a dark gray — not literal black) so an unlit-and-unfogged area
        // visually matches an unrevealed fog area instead of reading as
        // a distinctly darker "hole" that outlines the revealed shape.
        fill={colors.black}
        // The mask only cares about coverage, not crisp edges — skipping
        // the extra buffer canvas Konva uses for perfect drawing keeps a
        // many-light map cheap.
        perfectDrawEnabled={false}
        listening={false}
        sceneFunc={sceneFunc}
      />
    </Group>
  );
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export default DarknessOverlay;
