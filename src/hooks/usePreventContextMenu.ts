import { useEffect } from "react";
import type { RefObject } from "react";

function suppressNativeMenu(event: MouseEvent) {
  event.preventDefault();
  return false;
}

function usePreventContextMenu(targetRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const target = targetRef.current;
    if (!target) return undefined;

    target.addEventListener("contextmenu", suppressNativeMenu, { passive: false });
    return () => {
      target.removeEventListener("contextmenu", suppressNativeMenu);
    };
  }, [targetRef]);
}

export default usePreventContextMenu;
