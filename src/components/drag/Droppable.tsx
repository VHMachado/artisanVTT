import type { HTMLAttributes, ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";

type DroppableProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
  disabled?: boolean;
  id: string;
};

type DropRegistration = { disabled: boolean; id: string };

function droppableRegistration(id: string, disabled: boolean): DropRegistration {
  return { id, disabled };
}

function targetProps(props: HTMLAttributes<HTMLDivElement>) {
  return props;
}

function DropTarget({ children, node, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode; node: (element: HTMLElement | null) => void }) {
  return <div {...targetProps(props)} ref={node}>{children}</div>;
}

export default function Droppable({ children, disabled = false, id, ...props }: DroppableProps) {
  const { setNodeRef } = useDroppable(droppableRegistration(id, disabled));
  return <DropTarget {...props} node={setNodeRef}>{children}</DropTarget>;
}

