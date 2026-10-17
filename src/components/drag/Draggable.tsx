import type { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { Data } from "@dnd-kit/core/dist/store/types";

type DraggableProps = {
  children: ReactNode;
  data?: Data;
  disabled?: boolean;
  id: string;
};

const DRAGGING_OPACITY = 0.5;

type DragVisualState = {
  cursor: "grab" | "grabbing" | "not-allowed";
  opacity?: number;
  touchAction: "none";
};

function cursorFor(disabled: boolean | undefined, dragging: boolean): DragVisualState["cursor"] {
  if (disabled) return "not-allowed";
  return dragging ? "grabbing" : "grab";
}

const dragStyle = (disabled: boolean | undefined, dragging: boolean): DragVisualState => {
  const cursor = cursorFor(disabled, dragging);
  return { touchAction: "none", cursor, opacity: dragging ? DRAGGING_OPACITY : undefined };
};

function dragBindings(binding: ReturnType<typeof useDraggable>) {
  return { ...binding.attributes, ...binding.listeners };
}

export default function Draggable({ children, data, disabled = false, id }: DraggableProps) {
  const binding = useDraggable({ id, data, disabled });
  return (
    <div
      ref={binding.setNodeRef}
      style={dragStyle(disabled, binding.isDragging)}
      {...dragBindings(binding)}
    >
      {children}
    </div>
  );
}

