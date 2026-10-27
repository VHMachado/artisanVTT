import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";

const { getDatabase } = vi.hoisted(() => ({ getDatabase: vi.fn() }));

vi.mock("../database", () => ({ getDatabase }));
vi.mock("../components/Modal", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../components/LoadingOverlay", () => ({ default: () => <div data-testid="loading" /> }));
vi.mock("simplebar-react", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import SelectDataModal from "./SelectDataModal";

afterEach(() => {
  vi.clearAllMocks();
});

describe("SelectDataModal", () => {
  test("loads the staging library once when using the default filter", async () => {
    const groups = { items: [] };
    const table = {
      filter: () => ({ each: async () => undefined }),
      get: async () => groups,
    };
    getDatabase.mockReturnValue({ table: () => table, close: vi.fn() });

    const container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => {
      ReactDOM.render(
        <SelectDataModal
          isOpen
          onRequestClose={vi.fn()}
          onConfirm={vi.fn()}
          databaseName="ArtisanImportDB"
        />,
        container
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(getDatabase).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="loading"]')).toBeNull();
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
  });
});
