import { useEffect, useRef } from "react";

const MANAGED_PORTAL_ROOT = "data-artisan-portal-root";

function createPortalRoot(id: string) {
  const root = document.createElement("div");
  root.id = id;
  root.setAttribute(MANAGED_PORTAL_ROOT, "true");
  document.body.appendChild(root);
  return root;
}

/**
 * Returns a stable element that React can render into with createPortal.
 * A root created by this hook is removed once its final portal child unmounts;
 * a pre-existing DOM target is left untouched.
 */
function usePortal(id: string): HTMLElement {
  const elementRef = useRef<HTMLElement | null>(null);

  if (!elementRef.current) {
    elementRef.current = document.createElement("div");
  }

  useEffect(() => {
    const root = document.getElementById(id) || createPortalRoot(id);
    const element = elementRef.current;

    if (element) {
      root.appendChild(element);
    }

    return () => {
      element?.remove();
      if (
        root.getAttribute(MANAGED_PORTAL_ROOT) === "true" &&
        root.childElementCount === 0
      ) {
        root.remove();
      }
    };
  }, [id]);

  return elementRef.current;
}

export default usePortal;
