import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import usePortal from "./usePortal";

function PortalRoot({ id }: { id: string }) {
  usePortal(id);
  return null;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("usePortal", () => {
  it("removes the root it created after the last portal unmounts", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    act(() => {
      ReactDOM.render(<PortalRoot id="tile-drag-overlay" />, container);
    });
    expect(document.getElementById("tile-drag-overlay")).not.toBeNull();

    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });

    expect(document.getElementById("tile-drag-overlay")).toBeNull();
  });
});
