import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";

import { usePlayerState, usePlayerUpdater } from "./PlayerContext";

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  try {
    act(() => {
      ReactDOM.render(element, container);
    });
  } catch (error) {
    container.remove();
    throw error;
  }
  return () => {
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
  };
}

function expectMissingProvider(
  element: React.ReactElement,
  message: string
) {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    expect(() => mount(element)).toThrow(message);
  } finally {
    consoleError.mockRestore();
  }
}

describe("usePlayerState / usePlayerUpdater", () => {
  it("throws without a PlayerProvider snapshot context", () => {
    function Reader() {
      usePlayerState();
      return null;
    }
    expectMissingProvider(
      <Reader />,
      "usePlayerState must be used within a PlayerProvider"
    );
  });

  it("throws without a PlayerProvider updater context", () => {
    function Reader() {
      usePlayerUpdater();
      return null;
    }
    expectMissingProvider(
      <Reader />,
      "usePlayerUpdater must be used within a PlayerProvider"
    );
  });

});
