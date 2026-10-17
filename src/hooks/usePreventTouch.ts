import type { RefObject } from "react";
import { useEffect } from "react";

function stopDefaultTouchAction(event: TouchEvent) {
  event.preventDefault();
}

function usePreventTouch(nodeRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const node = nodeRef.current;
    if (!node) {
      return undefined;
    }
    node.addEventListener("touchstart", stopDefaultTouchAction, false);
    return () => node.removeEventListener("touchstart", stopDefaultTouchAction);
  }, [nodeRef]);
}

export default usePreventTouch;
