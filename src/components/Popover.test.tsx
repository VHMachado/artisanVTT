import { describe, expect, test, vi } from "vitest";
import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom";

import Popover from "./Popover";

/**
 * Cobre o contrato do primitivo novo — ancoragem,
 * fechar com Escape/clique fora, e NÃO fechar com o clique no próprio
 * botão que abriu (regressão óbvia: o mesmo clique que monta o popover
 * ainda está em bolha quando o listener de "clique fora" é registrado).
 */
function renderAnchor() {
  const anchor = document.createElement("button");
  anchor.getBoundingClientRect = () =>
    ({ left: 100, right: 140, top: 500, bottom: 540, width: 40, height: 40 } as DOMRect);
  document.body.appendChild(anchor);
  return anchor;
}

function renderPopover(anchor: HTMLElement, onRequestClose: () => void, side?: "top" | "bottom") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(
      <Popover anchorRef={{ current: anchor }} onRequestClose={onRequestClose} side={side}>
        <div data-testid="content">conteúdo</div>
      </Popover>,
      container
    );
  });
  return {
    container,
    unmount: () =>
      act(() => {
        ReactDOM.unmountComponentAtNode(container);
      }),
  };
}

describe("Popover", () => {
  test("renders its content portaled to document.body", () => {
    const anchor = renderAnchor();
    const { unmount } = renderPopover(anchor, vi.fn());

    expect(document.body.textContent).toContain("conteúdo");

    unmount();
    anchor.remove();
  });

  test("closes on Escape", () => {
    const anchor = renderAnchor();
    const onRequestClose = vi.fn();
    const { unmount } = renderPopover(anchor, onRequestClose);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onRequestClose).toHaveBeenCalledTimes(1);

    unmount();
    anchor.remove();
  });

  test("closes on an outside pointerdown", () => {
    const anchor = renderAnchor();
    const onRequestClose = vi.fn();
    const { unmount } = renderPopover(anchor, onRequestClose);

    const outside = document.createElement("div");
    document.body.appendChild(outside);
    act(() => {
      outside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });

    expect(onRequestClose).toHaveBeenCalledTimes(1);

    unmount();
    anchor.remove();
    outside.remove();
  });

  // Regressão: o clique que ABRE o popover (no botão âncora) ainda está
  // em bolha quando o listener de "fora" é registrado no mesmo tick. Sem
  // a exclusão explícita do anchor, o popover fecharia no instante em
  // que abre.
  test("does not close on a pointerdown on the anchor itself", () => {
    const anchor = renderAnchor();
    const onRequestClose = vi.fn();
    const { unmount } = renderPopover(anchor, onRequestClose);

    act(() => {
      anchor.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });

    expect(onRequestClose).not.toHaveBeenCalled();

    unmount();
    anchor.remove();
  });

  // A11y: react-modal (o que isto substitui) movia o foco para dentro ao
  // abrir e devolvia ao elemento que abriu ao fechar, de graça — um
  // `Box` portado não ganha isso sozinho.
  test("moves focus into the panel on open and returns it to the anchor on close", () => {
    const anchor = renderAnchor();
    document.body.appendChild(anchor);
    anchor.focus();
    const { container, unmount } = renderPopover(anchor, vi.fn());

    const panel = container.ownerDocument.querySelector('[role="dialog"]');
    expect(panel).not.toBeNull();
    expect(document.activeElement).toBe(panel);

    unmount();
    expect(document.activeElement).toBe(anchor);

    anchor.remove();
  });

  test("Tab from the last focusable element wraps to the first", () => {
    const anchor = renderAnchor();
    const container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      ReactDOM.render(
        <Popover anchorRef={{ current: anchor }} onRequestClose={vi.fn()}>
          <button>primeiro</button>
          <button>último</button>
        </Popover>,
        container
      );
    });

    const buttons = document.querySelectorAll("button");
    const first = Array.from(buttons).find((b) => b.textContent === "primeiro")!;
    const last = Array.from(buttons).find((b) => b.textContent === "último")!;
    last.focus();

    act(() => {
      const event = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
      Object.defineProperty(event, "target", { value: last });
      document.dispatchEvent(event);
    });

    expect(document.activeElement).toBe(first);

    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    anchor.remove();
  });
});
