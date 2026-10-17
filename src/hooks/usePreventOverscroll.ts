import { useEffect } from "react";
import type { RefObject } from "react";

function suppressWheel(event: WheelEvent) {
  event.preventDefault();
}

function usePreventOverscroll(targetRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const target = targetRef.current;
    if (!target) return undefined;

    target.addEventListener("wheel", suppressWheel, { passive: false });
    return () => {
      target.removeEventListener("wheel", suppressWheel);
    };
  }, [targetRef]);
}

export default usePreventOverscroll;
