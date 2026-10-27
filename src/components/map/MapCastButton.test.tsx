import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom";
import { afterEach, describe, expect, test, vi } from "vitest";

let isSpectator = true;
const openWirelessDisplayPicker = vi.fn();
const addToast = vi.fn();

vi.mock("../../contexts/SpectatorContext", () => ({
  useIsSpectator: () => isSpectator,
}));
vi.mock("../../helpers/cast", () => ({
  openWirelessDisplayPicker: () => openWirelessDisplayPicker(),
}));
vi.mock("react-toast-notifications", () => ({
  useToasts: () => ({ addToast }),
}));

import MapCastButton from "./MapCastButton";

const containers: HTMLElement[] = [];

afterEach(() => {
  while (containers.length) {
    const container = containers.pop() as HTMLElement;
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
  }
  openWirelessDisplayPicker.mockReset();
  addToast.mockReset();
});

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  containers.push(container);
  await act(async () => {
    ReactDOM.render(<MapCastButton />, container);
  });
  return container;
}

const castButton = 'button[aria-label="Transmitir via rede (Miracast)"]';

describe("MapCastButton", () => {
  test("renders only inside the Espectador window", async () => {
    isSpectator = true;
    expect((await mount()).querySelector(castButton)).not.toBeNull();

    isSpectator = false;
    expect((await mount()).querySelector(castButton)).toBeNull();
  });

  test("opens the wireless-display picker and reports failure", async () => {
    isSpectator = true;
    openWirelessDisplayPicker.mockRejectedValue(
      new Error("Transmitir via rede ainda não está configurado nesta máquina Linux")
    );
    const container = await mount();

    await act(async () => {
      (container.querySelector(castButton) as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(openWirelessDisplayPicker).toHaveBeenCalledTimes(1);
    expect(addToast).toHaveBeenCalledWith(
      "Transmitir via rede ainda não está configurado nesta máquina Linux",
      { appearance: "error" }
    );
  });
});
