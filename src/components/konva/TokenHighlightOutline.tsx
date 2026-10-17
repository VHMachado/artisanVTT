import Konva from "konva";
import { Rect, Circle, Line } from "react-konva";

import { Outline } from "../../types/Outline";

type TokenHighlightOutlineProps = {
  outline: Outline;
  color: string;
  strokeWidth: number;
  /** Pedido do usuário (2026-10-12, quarta rodada): halo suave atrás do
   * contorno — DESIGN.md "Elevation & Depth" item 3 ("Glow pontual, não
   * caixa de sombra ... halo suave em primary atrás de um elemento
   * circular de destaque"). Omitido (undefined) para um indicador que
   * deve ser só a borda, sem o halo — ver o comentário no Token.tsx que
   * usa isto para diferenciar seleção (sem glow) de turno ativo (com
   * glow). */
  glowBlur?: number;
} & Konva.ShapeConfig;

/**
 * Pedido do usuário (2026-10-12, quarta rodada): substitui a antiga
 * borda azul sempre-retangular (reportada como "amadora") por um
 * contorno que segue a MESMA forma do recorte do token (círculo,
 * retângulo ou caminho — ver `getScaledOutline`/`TokenOutline.tsx`,
 * mesma fonte geométrica) na paleta dourado/bronze do DESIGN.md em vez
 * de uma cor azul solta do resto do tema. Reaproveitado por Token.tsx
 * para os dois indicadores que seguem essa linguagem visual: seleção
 * (`selected`, borda sem glow) e turno ativo no combate (`isActiveTurn`,
 * borda + glow — ver `glowBlur`).
 */
function TokenHighlightOutline({
  outline,
  color,
  strokeWidth,
  glowBlur,
  ...shapeProps
}: TokenHighlightOutlineProps) {
  const appearance: Konva.ShapeConfig = {
    stroke: color,
    strokeWidth,
    fillEnabled: false,
    listening: false,
    ...(glowBlur
      ? {
          shadowColor: color,
          shadowBlur: glowBlur,
          shadowOpacity: 0.85,
          shadowForStrokeEnabled: true,
        }
      : {}),
  };

  switch (outline.type) {
    case "rect":
      return (
        <Rect
          {...appearance}
          {...shapeProps}
          {...outline}
          cornerRadius={Math.min(outline.width, outline.height) * 0.08}
        />
      );
    case "circle":
      return <Circle {...appearance} {...shapeProps} {...outline} />;
    default:
      return (
        <Line
          {...appearance}
          {...shapeProps}
          points={outline.points}
          closed
          tension={outline.points.length < 200 ? 0 : 0.33}
        />
      );
  }
}

export default TokenHighlightOutline;
