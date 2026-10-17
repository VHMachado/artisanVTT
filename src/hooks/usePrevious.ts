import { useRef, useEffect } from "react";

const usePrevious = <T,>(latest: T): T => {
  const snapshot = useRef<T>(latest);

  useEffect(() => {
    snapshot.current = latest;
  });

  return snapshot.current;
};

export default usePrevious;
