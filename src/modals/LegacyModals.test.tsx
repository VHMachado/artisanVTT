import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom";
import { describe, expect, test, vi } from "vitest";

vi.mock("../components/Modal", () => ({
  default: ({
    children,
    allowClose = true,
  }: {
    children: React.ReactNode;
    allowClose?: boolean;
  }) => <section data-allow-close={String(allowClose)}>{children}</section>,
}));

import ConfirmModal from "./ConfirmModal";
import ForceUpdateModal from "./ForceUpdateModal";

function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(element, container);
  });
  return {
    container,
    unmount: () => {
      act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
      container.remove();
    },
  };
}

describe("legacy modal compatibility", () => {
  test("ConfirmModal confirms without requesting close, while cancel requests close", () => {
    const onConfirm = vi.fn();
    const onRequestClose = vi.fn();
    const view = render(
      <ConfirmModal
        isOpen
        onConfirm={onConfirm}
        onRequestClose={onRequestClose}
        confirmText="Delete"
        label="Delete map?"
        description="This cannot be undone."
      />
    );

    const buttons = Array.from(view.container.querySelectorAll("button"));
    act(() => {
      buttons.find((button) => button.textContent === "Delete")?.click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onRequestClose).not.toHaveBeenCalled();

    act(() => {
      buttons.find((button) => button.textContent === "Cancel")?.click();
    });
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  test("ForceUpdateModal remains blocking", () => {
    const view = render(<ForceUpdateModal isOpen />);
    expect(view.container.querySelector("section")?.dataset.allowClose).toBe("false");
    expect(view.container.textContent).toContain("Please refresh your browser");
    view.unmount();
  });
});
