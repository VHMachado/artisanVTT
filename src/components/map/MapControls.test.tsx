import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom";
import { describe, expect, test, vi } from "vitest";

vi.mock("../Popover", () => ({
  default: ({ side, children }: { side?: string; children: React.ReactNode }) => (
    <div data-popover-side={side}>{children}</div>
  ),
}));

vi.mock("../../hooks/useSetting", () => ({
  default: () => [false, vi.fn()],
}));

vi.mock("../../contexts/KeyboardContext", () => ({ useKeyboard: vi.fn() }));
vi.mock("../../contexts/SpectatorContext", () => ({ useIsSpectator: () => false }));
vi.mock("../../contexts/AccountContext", () => ({ useAccount: () => ({ session: null }) }));
vi.mock("../../contexts/UserIdContext", () => ({ useUserId: () => "gm" }));
vi.mock("../../helpers/spectator", () => ({ openSpectatorWindow: vi.fn() }));
vi.mock("react-toast-notifications", () => ({ useToasts: () => ({ addToast: vi.fn() }) }));
vi.mock("./SelectMapButton", () => ({ default: () => <div /> }));
vi.mock("../RadioIconButton", () => ({
  default: ({
    children,
    isSelected: _isSelected,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { isSelected?: boolean }) => (
    <button {...props}>{children}</button>
  ),
}));

import MapControls from "./MapControls";

describe("MapControls", () => {
  test("does not render the unused collapse control", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    act(() => {
      ReactDOM.render(
        <MapControls
          onMapChange={vi.fn()}
          onMapReset={vi.fn()}
          map={null}
          mapState={null}
          mapActions={{ actionIndex: -1, actions: [] } as any}
          allowMapChange
          bindings={{ left: "move", right: "move" }}
          onBindingsChange={vi.fn()}
          settingsToolId="move"
          onSettingsToolChange={vi.fn()}
          toolSettings={{} as any}
          onToolSettingChange={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          isMapOwner={false}
          gameId="game"
          onMapDarknessChange={vi.fn()}
        />,
        container
      );
    });

    expect(
      container.querySelector('button[aria-label="Hide Map Controls"]')
    ).toBeNull();

    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  test("keeps the right-side controls inset from the viewport edge", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    act(() => {
      ReactDOM.render(
        <MapControls
          onMapChange={vi.fn()}
          onMapReset={vi.fn()}
          map={null}
          mapState={null}
          mapActions={{ actionIndex: -1, actions: [] } as any}
          allowMapChange
          bindings={{ left: "move", right: "move" }}
          onBindingsChange={vi.fn()}
          settingsToolId="move"
          onSettingsToolChange={vi.fn()}
          toolSettings={{} as any}
          onToolSettingChange={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          isMapOwner={false}
          gameId="game"
          onMapDarknessChange={vi.fn()}
        />,
        container
      );
    });

    const rail = container.firstElementChild as HTMLElement;
    const fullscreen = container.querySelector(
      'button[aria-label="Enter Full Screen"]'
    )?.parentElement as HTMLElement;

    expect(getComputedStyle(rail).top).toBe("16px");
    expect(getComputedStyle(rail).right).toBe("16px");
    expect(getComputedStyle(fullscreen).right).toBe("16px");

    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  test("opens darkness settings to the left of the right rail", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    act(() => {
      ReactDOM.render(
        <MapControls
          onMapChange={vi.fn()}
          onMapReset={vi.fn()}
          map={null}
          mapState={{ darkness: { enabled: true }, editFlags: [] } as any}
          mapActions={{ actionIndex: -1, actions: [] } as any}
          allowMapChange
          bindings={{ left: "move", right: "move" }}
          onBindingsChange={vi.fn()}
          settingsToolId="move"
          onSettingsToolChange={vi.fn()}
          toolSettings={{} as any}
          onToolSettingChange={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          isMapOwner
          gameId="game"
          onMapDarknessChange={vi.fn()}
        />,
        container
      );
    });

    act(() => {
      (
        container.querySelector(
          'button[aria-label="Configurar escuridão"]'
        ) as HTMLButtonElement
      ).click();
    });

    expect(document.querySelector("[data-popover-side]"))
      .toHaveAttribute("data-popover-side", "left");

    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

});
