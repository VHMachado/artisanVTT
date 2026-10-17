import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom";
import { describe, expect, test, vi } from "vitest";

const currentUserId = "owner-1";

vi.mock("../map/MapMenu", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../contexts/UserIdContext", () => ({
  useUserId: () => currentUserId,
}));

import TokenMenu from "./TokenMenu";

function renderMenu(overrides: Partial<React.ComponentProps<typeof TokenMenu>> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const onTokenStateChange = vi.fn();
  const props: React.ComponentProps<typeof TokenMenu> = {
    isOpen: true,
    onRequestClose: vi.fn(),
    focus: false,
    onTokenStateChange,
    map: { owner: currentUserId } as any,
    tokenState: {
      id: "token-1",
      label: "Scout",
      statuses: ["red", "red"],
      visible: true,
      locked: false,
      category: "character",
    } as any,
    ...overrides,
  };
  act(() => {
    ReactDOM.render(<TokenMenu {...props} />, container);
  });
  return {
    container,
    onTokenStateChange,
    unmount: () => {
      act(() => {
        ReactDOM.unmountComponentAtNode(container);
      });
      container.remove();
    },
  };
}

describe("TokenMenu compatibility", () => {
  test("limits label updates to 48 characters", () => {
    const view = renderMenu();
    const input = view.container.querySelector("#changeTokenLabel") as HTMLInputElement;
    const label = "x".repeat(60);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, label);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(view.onTokenStateChange).toHaveBeenCalledWith({
      "token-1": { label: "x".repeat(48) },
    });
    view.unmount();
  });

  test("toggles a status without retaining duplicate legacy entries", () => {
    const view = renderMenu();
    const red = view.container.querySelector('[aria-label="Token label Color red"]') as HTMLElement;
    act(() => red.click());

    expect(view.onTokenStateChange).toHaveBeenCalledWith({
      "token-1": { statuses: [] },
    });
    view.unmount();
  });

  test("reserves visibility, lock, and category controls for the map owner", () => {
    const ownerView = renderMenu();
    expect(ownerView.container.querySelector('[aria-label="Hide Token"]')).not.toBeNull();
    expect(ownerView.container.querySelector('[aria-label="Lock Token"]')).not.toBeNull();
    expect(ownerView.container.querySelector('[aria-label="Character"]')).not.toBeNull();
    ownerView.unmount();

    const playerView = renderMenu({ map: { owner: "another-user" } as any });
    expect(playerView.container.querySelector('[aria-label="Hide Token"]')).toBeNull();
    expect(playerView.container.querySelector('[aria-label="Lock Token"]')).toBeNull();
    expect(playerView.container.querySelector('[aria-label="Character"]')).toBeNull();
    playerView.unmount();
  });
});
