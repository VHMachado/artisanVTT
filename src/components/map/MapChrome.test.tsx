import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom";
import { describe, expect, test, vi } from "vitest";

let groups = [{ id: "map-a", type: "item", items: [] }] as any[];
let selectedGroupIds = ["map-a"] as string[];

vi.mock("../../contexts/GroupContext", () => ({
  useGroup: () => ({ activeGroups: groups, selectedGroupIds }),
}));

import SelectMapSelectButton from "./SelectMapSelectButton";
import Tile from "../tile/Tile";

function render(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(node, container);
  });
  return {
    container,
    unmount() {
      act(() => {
        ReactDOM.unmountComponentAtNode(container);
      });
      container.remove();
    },
  };
}

describe("map chrome compatibility", () => {
  test("selects a single item tile and ignores a selected group", () => {
    const onMapSelect = vi.fn();
    const view = render(<SelectMapSelectButton disabled={false} onMapSelect={onMapSelect} />);

    act(() => {
      (view.container.querySelector("button") as HTMLButtonElement).click();
    });
    expect(onMapSelect).toHaveBeenCalledWith("map-a");

    groups = [{ id: "folder", type: "group", name: "Maps", items: [] }] as any[];
    selectedGroupIds = ["folder"];
    act(() => {
      ReactDOM.render(<SelectMapSelectButton disabled={false} onMapSelect={onMapSelect} />, view.container);
    });
    act(() => {
      (view.container.querySelector("button") as HTMLButtonElement).click();
    });
    expect(onMapSelect).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  test("does not let the edit action select its tile", () => {
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    const view = render(
      <Tile
        title="Crypt"
        isSelected={false}
        onSelect={onSelect}
        onEdit={onEdit}
        onDoubleClick={vi.fn()}
        canEdit
        badges={[]}
        editTitle="Edit map"
      >
        <span>preview</span>
      </Tile>
    );

    act(() => {
      (view.container.querySelector('[aria-label="Edit map"]') as HTMLButtonElement).click();
    });
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();

    act(() => {
      (view.container.querySelector('[aria-label="Crypt"]') as HTMLElement).click();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
