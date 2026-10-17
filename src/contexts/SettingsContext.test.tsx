import React, { useState } from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";

const { getAll, setAll } = vi.hoisted(() => ({
  getAll: vi.fn(),
  setAll: vi.fn(),
}));

vi.mock("../settings", () => ({
  getSettings: () => ({ getAll, setAll }),
}));

import SettingsContext, { SettingsProvider, useSettings } from "./SettingsContext";
import useSetting from "../hooks/useSetting";

function createInitialSettings() {
  return { map: { partyWidth: 220 } } as any;
}

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(element, container);
  });
  return () => {
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
  };
}

describe("settings hooks and provider", () => {
  it("updates a nested setting through the provider's legacy shallow state copy", () => {
    let changeWidth: ((value: number) => void) | undefined;
    const snapshots: any[] = [];

    function ContextHarness() {
      const [settings, setSettings] = useState(createInitialSettings());
      snapshots.push(settings);
      return (
        <SettingsContext.Provider value={{ settings, setSettings }}>
          <SettingConsumer onReady={(setWidth) => (changeWidth = setWidth)} />
        </SettingsContext.Provider>
      );
    }

    function SettingConsumer({ onReady }: { onReady: (setter: (value: number) => void) => void }) {
      const [, setWidth] = useSetting<number>("map.partyWidth");
      onReady(setWidth);
      return null;
    }

    const unmount = mount(<ContextHarness />);
    act(() => changeWidth?.(320));

    expect(snapshots[0].map.partyWidth).toBe(320);
    expect(snapshots.at(-1).map.partyWidth).toBe(320);
    unmount();
  });

  it("loads settings once and persists each provider state", () => {
    getAll.mockReturnValue(createInitialSettings());
    let observedWidth: number | undefined;

    function Reader() {
      observedWidth = useSettings().settings.map.partyWidth;
      return null;
    }

    const unmount = mount(
      <SettingsProvider>
        <Reader />
      </SettingsProvider>
    );

    expect(observedWidth).toBe(220);
    expect(setAll).toHaveBeenCalledWith({ map: { partyWidth: 220 } });
    unmount();
  });
});
