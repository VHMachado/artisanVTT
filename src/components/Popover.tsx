import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Box } from "theme-ui";

export type PopoverAnchor = { current: HTMLElement | null };

type PopoverSide = "top" | "bottom" | "left";

type PopoverProps = {
  /** O elemento (geralmente um botão) contra o qual o painel se ancora. */
  anchorRef: PopoverAnchor;
  onRequestClose: () => void;
  /** `bottom` (padrão) abre para baixo do botão, `top` para cima, `left`
   * para a esquerda (rail da direita) — centrado verticalmente
   * no anchor em vez de horizontalmente. */
  side?: PopoverSide;
  /** `card` (padrão): `surface` opaco + sombra, igual todo popover já
   * usava. `glass`: `overlay` translúcido + blur, para colar
   * visualmente no mesmo "vidro fosco" dos botões circulares do rail
   * (`floatingButtonSx`) em vez de destacar como um cartão separado. */
  variant?: "card" | "glass";
  /** `true` (padrão): rouba o foco ao abrir, prende Tab lá dentro e
   * fecha com Escape/clique fora — comportamento de menu transitório.
   * `false` (quando managed focus is disabled): nenhuma das três coisas —
   * para um painel
   * permanentemente montado (a faixa de configurações de ferramenta,
   * visível o tempo todo que a ferramenta está ativa), roubar o foco e
   * prender Tab impediria o usuário de sair dele com o teclado enquanto
   * desenha/usa a ferramenta. */
  managesFocus?: boolean;
  children: React.ReactNode;
};

const EDGE_MARGIN = 12;
const GAP = 12;

/**
 * Primitivo novo para os três painéis suspensos
 * (iniciativa, configurações, escuridão) que substituem modais
 * centralizados. Portado para `document.body` como `ContextMenu.tsx` já
 * faz, pela mesma razão: não ser cortado por um ancestral com scroll
 * (SimpleBar da Party, por exemplo).
 *
 * Difere de `ContextMenu` em DUAS coisas, não é o mesmo componente com
 * outro nome: ancora em ELEMENTO (getBoundingClientRect do botão),
 * não em coordenada de clique; e aceita conteúdo arbitrário (formulários,
 * sliders, listas), não uma lista de `menuItem`. Mesmo visual que
 * `ContextMenu` já fixa para todo menu flutuante: `surface`, raio 12px,
 * sombra em vez de borda — ver DESIGN.md.
 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Popover({
  anchorRef,
  onRequestClose,
  side = "bottom",
  variant = "card",
  managesFocus = true,
  children,
}: PopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // null enquanto a posição final (já clampada contra a viewport) não foi
  // calculada — evita um frame visível no canto errado antes do clamp.
  const [style, setStyle] = useState<
    | { left: number; top?: number; bottom?: number; transform: string }
    | null
  >(null);

  // O `react-modal` que isto substitui movia o foco para dentro ao abrir,
  // prendia o Tab lá dentro e devolvia o foco ao elemento que abriu o
  // modal ao fechar — de graça. Virar um `Box` portado perde os três.
  // Sem isto, Tab escapa para o resto da página com o painel ainda
  // visível (teclado) e o botão que abriu o painel perde o foco sem
  // recebê-lo de volta ao fechar (leitor de tela).
  const hasFocusedRef = useRef(false);
  useLayoutEffect(() => {
    // O painel começa `visibility: hidden` até a primeira medição (ver
    // efeito de posicionamento abaixo) — elementos ocultos não aceitam
    // foco na maioria dos navegadores. Só foca depois que `style` sai de
    // `null`, e só uma vez (um resize que recalcula `style` não deve
    // roubar o foco de novo).
    if (!managesFocus || !style || hasFocusedRef.current) {
      return;
    }
    hasFocusedRef.current = true;
    // Foca o próprio painel (tem tabIndex=-1, ver abaixo) em vez do
    // primeiro campo: um painel só com texto (ex.: aviso de escuridão sem
    // controles focáveis acima) ainda precisa de um alvo de foco válido.
    containerRef.current?.focus({ preventScroll: true });
  }, [style, managesFocus]);

  // Devolve o foco ao botão que abriu o painel quando ele desmonta —
  // closure separada do efeito acima para capturar o `anchorRef.current`
  // de quando o painel abriu, não o de quando ele fechar (poderia já ter
  // mudado se o call site troca o botão entre renders).
  useLayoutEffect(() => {
    if (!managesFocus) {
      return;
    }
    const trigger = anchorRef.current;
    return () => {
      // Só devolve o foco se ele ainda estiver dentro do painel — se o
      // usuário já clicou em outra coisa (ex.: o próprio botão que vai
      // fechar e reabrir), roubar o foco de volta seria pior que não
      // devolver nada.
      if (containerRef.current?.contains(document.activeElement)) {
        trigger?.focus({ preventScroll: true });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Duas medições em sequência: a do botão (decide o centro desejado) e a
  // do próprio painel, depois que ele já existe no DOM com seu tamanho
  // real — só então dá para saber se precisa deslocar para não vazar da
  // tela. Um painel largo perto da borda do dock (Iniciativa/Escuridão,
  // ambos próximos à lateral) vazaria sem este segundo passo.
  useLayoutEffect(() => {
    function measure() {
      const anchor = anchorRef.current;
      const panel = containerRef.current;
      if (!anchor) {
        return;
      }
      const anchorRect = anchor.getBoundingClientRect();
      const panelWidth = panel?.offsetWidth ?? 0;
      const panelHeight = panel?.offsetHeight ?? 0;

      if (side === "left") {
        // Rail da direita — ancora pela borda esquerda do
        // botão, centrado verticalmente nele, em vez do eixo horizontal
        // que `top`/`bottom` usam para os botões do rodapé/topo.
        const desiredCenter = anchorRect.top + anchorRect.height / 2;
        const minTop = EDGE_MARGIN + panelHeight / 2;
        const maxTop = window.innerHeight - EDGE_MARGIN - panelHeight / 2;
        const top = Math.min(Math.max(desiredCenter, minTop), Math.max(minTop, maxTop));
        const left = Math.max(EDGE_MARGIN, anchorRect.left - GAP - panelWidth);
        setStyle({ left, top, transform: "translateY(-50%)" });
        return;
      }

      const desiredCenter = anchorRect.left + anchorRect.width / 2;
      const minLeft = EDGE_MARGIN + panelWidth / 2;
      const maxLeft = window.innerWidth - EDGE_MARGIN - panelWidth / 2;
      const left = Math.min(Math.max(desiredCenter, minLeft), Math.max(minLeft, maxLeft));

      if (side === "top") {
        const bottom = Math.max(
          EDGE_MARGIN,
          window.innerHeight - anchorRect.top + GAP
        );
        setStyle({ left, bottom, transform: "translateX(-50%)" });
      } else {
        const top = Math.min(
          anchorRect.bottom + GAP,
          Math.max(EDGE_MARGIN, window.innerHeight - EDGE_MARGIN - panelHeight)
        );
        setStyle({ left, top, transform: "translateX(-50%)" });
      }
    }
    // Primeira passada: posição aproximada, sem largura do painel ainda
    // (ele não existe no DOM até o primeiro render deste effect rodar).
    measure();
    // Segunda passada no próximo frame: agora containerRef já montou com
    // conteúdo real, então panelWidth/panelHeight refletem o tamanho real.
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [anchorRef, side]);

  // Fecha com Escape ou clique fora — fora do painel E fora do botão que
  // o abriu (senão o próprio clique de abrir, que ainda está em bolha,
  // fecharia o painel no mesmo instante em que ele aparece).
  useLayoutEffect(() => {
    if (!managesFocus) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !(anchorRef.current && anchorRef.current.contains(target))
      ) {
        onRequestClose();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onRequestClose();
        return;
      }
      // Tab-trap: o painel é um portal solto em document.body, então sem
      // isto o Tab sai dele para o resto da página com o painel ainda
      // visível por cima — o que o `react-modal` antigo nunca permitia.
      if (event.key !== "Tab") {
        return;
      }
      const panel = containerRef.current;
      if (!panel) {
        return;
      }
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (focusable.length === 0) {
        // Nada focável lá dentro (ex.: DarknessModal sem controles antes
        // do slider) — mantém o foco no próprio painel em vez de deixar
        // o Tab escapar.
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!panel.contains(active)) {
        // Foco saiu do painel por algum outro caminho (ex.: clique
        // programático) — o próximo Tab deve voltar para dentro dele.
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onRequestClose, anchorRef]);

  return createPortal(
    <Box
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      // -1: focável via .focus() programático (foco inicial e fallback do
      // tab-trap), mas fora da ordem normal de Tab do usuário.
      tabIndex={-1}
      bg={variant === "glass" ? "overlay" : "surface"}
      sx={{
        position: "fixed",
        left: style ? `${style.left}px` : "-9999px",
        top: style?.top !== undefined ? `${style.top}px` : undefined,
        bottom: style?.bottom !== undefined ? `${style.bottom}px` : undefined,
        transform: style?.transform ?? "translateX(-50%)",
        visibility: style ? "visible" : "hidden",
        borderRadius: "12px",
        border: "none",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
        zIndex: 200,
        ...(variant === "glass" && {
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }),
        // Nunca deixar o painel maior que a viewport — um conteúdo mais
        // alto que a tela (lista longa de iniciativa) rola por dentro em
        // vez de vazar.
        maxWidth: "calc(100vw - 24px)",
        maxHeight: "calc(100vh - 24px)",
        overflow: "auto",
      }}
    >
      {children}
    </Box>,
    document.body
  );
}

export default Popover;
