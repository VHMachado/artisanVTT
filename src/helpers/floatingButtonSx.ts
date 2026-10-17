import { ThemeUICSSObject } from "theme-ui";

/**
 * Estilo compartilhado dos botões circulares que
 * flutuam sobre o mapa (rail da direita em `MapControls.tsx`, dock
 * inferior em `MapDock.tsx`) — pedido explícito do usuário a partir de
 * uma referência visual de "vidro fosco" para ambos os conjuntos de
 * botões, não só um deles.
 *
 * `backdropFilter`/`WebkitBackdropFilter`: sem isto `overlay` é só uma
 * cor sólida translúcida, mas a referência mostra o conteúdo por trás
 * desfocado dentro do próprio círculo, não só escurecido. WebView2
 * (Chromium) suporta a propriedade sem prefixo — o `Webkit*` é
 * defensivo para qualquer motor que só entenda a forma prefixada.
 *
 * @param diameter Lado do círculo em px (o dock usa botões maiores que o
 * rail — ver `sideButtonSx`/`railButtonSx` nos call sites).
 * @param iconSize Lado do SVG interno em px.
 */
export function floatingButtonSx(
  diameter: number,
  iconSize: number
): ThemeUICSSObject {
  return {
    backgroundColor: "overlay",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    borderRadius: "50%",
    width: `${diameter}px`,
    height: `${diameter}px`,
    "& svg": { width: `${iconSize}px`, height: `${iconSize}px` },
  };
}
