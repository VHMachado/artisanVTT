import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { Progress } from "theme-ui";

type LoadingBarProps = { isLoading: boolean; loadingProgressRef: MutableRefObject<number> };

function paintFrame(
  loadingProgressRef: MutableRefObject<number>,
  progressBarRef: MutableRefObject<HTMLProgressElement | null>,
  frameRef: MutableRefObject<number | undefined>
) {
  if (progressBarRef.current) progressBarRef.current.value = loadingProgressRef.current;
  frameRef.current = requestAnimationFrame(() => paintFrame(loadingProgressRef, progressBarRef, frameRef));
}

function LoadingBar({ isLoading, loadingProgressRef }: LoadingBarProps) {
  const frameRef = useRef<number>();
  const progressBarRef = useRef<HTMLProgressElement>(null);

  useEffect(() => {
    if (!isLoading) return undefined;
    paintFrame(loadingProgressRef, progressBarRef, frameRef);
    return () => { if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  return <Progress color="primary" m={0} max={1} ref={progressBarRef} sx={{ borderRadius: 0, height: "4px", width: "100%" }} value={0} />;
}

export default LoadingBar;
