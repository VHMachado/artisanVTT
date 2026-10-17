import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

let clipboardAvailable = false;
let clipboardText = "";
const addToast = vi.fn();
const mapImage = { width: () => 100, height: () => 100, getAbsoluteTransform: () => ({ copy: () => ({ point: (point: any) => point }) }) };

vi.mock("../../contexts/KeyboardContext", () => ({ useKeyboard: () => undefined }));
vi.mock("../../contexts/MapStageContext", () => ({ useMapStage: () => ({ current: { findOne: () => mapImage } }) }));
vi.mock("../../contexts/UserIdContext", () => ({ useUserId: () => "owner" }));
vi.mock("../../helpers/shared", () => ({ clipboardSupported: () => Promise.resolve(clipboardAvailable) }));
vi.mock("../../helpers/konva", () => ({ getRelativePointerPosition: () => ({ x: 60, y: 70 }) }));
vi.mock("../../validators/MapState", () => ({ isMapState: () => true }));
vi.mock("../../validators/Selection", () => ({ isSelection: () => true }));
vi.mock("../../icons/CopyIcon", () => ({ default: () => <span /> }));
vi.mock("../../icons/PasteIcon", () => ({ default: () => <span /> }));
vi.mock("../../icons/TokenHideIcon", () => ({ default: () => <span /> }));
vi.mock("../../icons/TokenLockIcon", () => ({ default: () => <span /> }));
vi.mock("../../icons/TokenShowIcon", () => ({ default: () => <span /> }));
vi.mock("../../icons/TokenUnlockIcon", () => ({ default: () => <span /> }));
vi.mock("react-toast-notifications", () => ({ useToasts: () => ({ addToast }) }));
vi.mock("uuid", () => ({ v4: () => "cloned-token" }));
vi.mock("../map/MapMenu", () => ({
  default: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) => isOpen ? <div data-menu="open">{children}</div> : null,
}));

import SelectionMenu from "./SelectionMenu";

const selection = {
  type: "rectangle" as const,
  items: [{ id: "token-a", type: "token" as const }],
  x: 0,
  y: 0,
  data: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
};
const mapState = {
  mapId: "map-a",
  tokens: { "token-a": { id: "token-a", x: 0.1, y: 0.2, visible: true, locked: false } },
  fogs: {},
  editFlags: [],
} as any;

const roots: HTMLElement[] = [];

afterEach(() => {
  while (roots.length) {
    const root = roots.pop() as HTMLElement;
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    root.remove();
  }
  clipboardAvailable = false;
  clipboardText = "";
  addToast.mockReset();
  vi.unstubAllEnvs();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(), readText: vi.fn(() => Promise.resolve(clipboardText)) },
  });
});

function mount(overrides: Partial<React.ComponentProps<typeof SelectionMenu>> = {}) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  roots.push(root);
  const props = {
    map: { owner: "owner" } as any,
    mapState,
    selection,
    isOpen: true,
    active: true,
    onRequestOpen: vi.fn(),
    onRequestClose: vi.fn(),
    onSelectionItemsCreate: vi.fn(),
    onSelectionItemsChange: vi.fn(),
    onSelectionChange: vi.fn(),
    ...overrides,
  };
  act(() => {
    ReactDOM.render(<SelectionMenu {...props} />, root);
  });
  return { root, props };
}

describe("SelectionMenu", () => {
  it("restricts hide and lock controls to the map owner", () => {
    const owner = mount();
    expect(owner.root.querySelector('[aria-label="Hide Items"]')).not.toBeNull();
    expect(owner.root.querySelector('[aria-label="Lock Items"]')).not.toBeNull();

    const guest = mount({ map: { owner: "someone-else" } as any });
    expect(guest.root.querySelector('[aria-label="Hide Items"]')).toBeNull();
    expect(guest.root.querySelector('[aria-label="Lock Items"]')).toBeNull();
  });

  it("copies a selection into the local fallback and pastes relocated clones", async () => {
    vi.stubEnv("VITE_VERSION", "test-version");
    const created = vi.fn();
    const { root, props } = mount({ onSelectionItemsCreate: created });
    await act(async () => {
      (root.querySelector('[aria-label="Copy Items"]') as HTMLButtonElement).click();
    });
    expect(addToast).toHaveBeenCalledWith("Copied 1 token");

    act(() => {
      ReactDOM.render(<SelectionMenu {...props} selection={null} />, root);
    });
    await act(async () => {
      (root.querySelector('[aria-label="Paste Items"]') as HTMLButtonElement).click();
    });

    const pastedTokens = created.mock.calls[0][0];
    expect(pastedTokens).toHaveLength(1);
    expect(pastedTokens[0]).toMatchObject({ id: "cloned-token" });
    expect(pastedTokens[0].x).toBeCloseTo(0.5);
    expect(pastedTokens[0].y).toBeCloseTo(0.6);
    expect(props.onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({
      x: expect.closeTo(0.4),
      y: expect.closeTo(0.4),
      items: [{ id: "cloned-token", type: "token" }],
    }));
    expect(props.onRequestClose).toHaveBeenCalled();
  });

  it("rejects clipboard payloads with a different build version", async () => {
    vi.stubEnv("VITE_VERSION", "current-version");
    clipboardAvailable = true;
    clipboardText = JSON.stringify({ version: "old-version", data: mapState, selection });
    const { root, props } = mount({ selection: null });

    await act(async () => {
      (root.querySelector('[aria-label="Paste Items"]') as HTMLButtonElement).click();
    });

    expect(addToast).toHaveBeenCalledWith("Invalid data");
    expect(props.onSelectionItemsCreate).not.toHaveBeenCalled();
  });
});
