import type { Props } from "@dnd-kit/core/dist/components/DndContext/DndContext";
import { DndContext, DragEndEvent, useDndContext, useDndMonitor } from "@dnd-kit/core";
import { useCallback, useRef } from "react";

/**
 * dnd-kit's own `onDragEnd` doesn't carry where the drag overlay node
 * ended up on screen (github.com/clauderic/dnd-kit/issues/238). This
 * module's job is a single thing: remember that rect across the drag
 * and splice it onto the end event before the caller sees it.
 */
type CustomDragEndEvent = DragEndEvent & { overlayNodeClientRect?: DOMRect };
type CustomDragProps = { onDragEnd?: (event: CustomDragEndEvent) => void };

export type { CustomDragEndEvent };

/** Subscribes to the ambient dnd-kit context and calls `onDragEnd` with
 * the overlay's last known client rect spliced in — a hook rather than
 * a mounted sibling component, since nothing here renders anything. */
function useOverlayRectOnDragEnd({ onDragEnd }: CustomDragProps) {
  const { overlayNode } = useDndContext();
  const lastRect = useRef<DOMRect>();

  const captureRect = useCallback(() => {
    const rect = overlayNode?.nodeRef?.current?.getBoundingClientRect();
    if (rect) {
      lastRect.current = rect;
    }
  }, [overlayNode]);

  const forwardEnd = useCallback(
    (event: DragEndEvent) => {
      onDragEnd?.({ ...event, overlayNodeClientRect: lastRect.current });
    },
    [onDragEnd]
  );

  useDndMonitor({ onDragMove: captureRect, onDragEnd: forwardEnd });
}

function OverlayRectMonitor(props: CustomDragProps) {
  useOverlayRectOnDragEnd(props);
  return null;
}

type DragContextProps = CustomDragProps & Props;

function DragContext(props: DragContextProps) {
  const { children, onDragEnd, ...dndProps } = props;
  const content = (
    <>
      <OverlayRectMonitor onDragEnd={onDragEnd} />
      {children}
    </>
  );
  return <DndContext {...dndProps}>{content}</DndContext>;
}

export default DragContext;
