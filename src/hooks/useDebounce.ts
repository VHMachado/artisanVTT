import { useState, useEffect } from "react";

function useDebounce<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState<T>();
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export default useDebounce;
