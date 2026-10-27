import ReactDOM from "react-dom";
import Modal from "react-modal";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../contexts/MapInteractionContext", () => ({
  useInteractionEmitter: () => null,
}));

import MapMenu from "./MapPopup";

const roots: HTMLElement[] = [];

afterEach(() => {
  while (roots.length) {
    const root = roots.pop() as HTMLElement;
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    root.remove();
  }
});

function mount(isOpen: boolean, onModalContent: (node: HTMLDivElement) => void) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  roots.push(root);
  Modal.setAppElement(root);
  const render = (open: boolean) =>
    act(() => {
      ReactDOM.render(
        <MapMenu
          isOpen={open}
          onRequestClose={() => undefined}
          onModalContent={onModalContent}
        >
          <span>contents</span>
        </MapMenu>,
        root
      );
    });
  render(isOpen);
  return render;
}

describe("MapMenu", () => {
  /**
   * `react-modal` detaches `contentRef` with `null` when the content
   * unmounts. Forwarding that to `onModalContent` crashed consumers that
   * measure the node (SelectionMenu clamps itself to the map), and because
   * the throw happens inside React's commit phase it blanked the entire
   * window instead of just failing the menu.
   */
  it("never hands its content callback the null detach on close", () => {
    const seen: unknown[] = [];
    const render = mount(true, (node) => {
      seen.push(node);
      // Mirrors what every real consumer does with the node.
      node.getBoundingClientRect();
    });

    expect(seen.length).toBe(1);
    expect(seen[0]).toBeInstanceOf(HTMLElement);

    expect(() => render(false)).not.toThrow();
    expect(seen.length).toBe(1);
  });
});
