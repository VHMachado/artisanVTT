import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../RadioIconButton", () => ({
  default: ({
    title,
    onClick,
    children,
    disabled,
  }: {
    title: string;
    onClick: () => void;
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <button aria-label={title} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

import ToolSection, { Tool } from "./ToolSection";

const tools: Tool[] = [
  { id: "rectangle", title: "Rectangle", isSelected: true, icon: "R" },
  { id: "path", title: "Path", isSelected: false, icon: "P" },
];

function mount(element: React.ReactElement) {
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

describe("ToolSection", () => {
  it("renders every tool when not collapsed", () => {
    const onToolClick = vi.fn();
    const { container, unmount } = mount(
      <ToolSection collapse={false} tools={tools} onToolClick={onToolClick} />
    );

    expect(container.querySelectorAll("button")).toHaveLength(2);
    act(() => {
      (container.querySelector('[aria-label="Path"]') as HTMLButtonElement).click();
    });
    expect(onToolClick).toHaveBeenCalledWith(tools[1]);
    unmount();
  });

  it("expands the unselected tools from the selected collapsed tool", () => {
    const onToolClick = vi.fn();
    const { container, unmount } = mount(
      <ToolSection collapse tools={tools} onToolClick={onToolClick} />
    );

    expect(container.querySelectorAll("button")).toHaveLength(1);
    act(() => {
      (container.querySelector('[aria-label="Rectangle"]') as HTMLButtonElement).click();
    });
    expect(container.querySelectorAll("button")).toHaveLength(2);
    act(() => {
      (container.querySelector('[aria-label="Path"]') as HTMLButtonElement).click();
    });
    expect(onToolClick).toHaveBeenLastCalledWith(tools[1]);
    unmount();
  });
});
