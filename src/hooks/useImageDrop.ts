import { useState } from "react";
import { useToasts } from "react-toast-notifications";

import Vector2 from "../helpers/Vector2";

export type ImageDropEvent = {
  files: File[];
  dropPosition: Vector2;
};

type ToastFn = (message: string) => void;

/** Filters a browser `FileList` down to the types this drop target
 * accepts, toasting once per rejected entry. */
function collectSupportedFiles(
  fileList: FileList,
  supportFileTypes: string[],
  addToast: ToastFn
): File[] {
  const accepted: File[] = [];
  for (const file of fileList) {
    if (supportFileTypes.includes(file.type)) {
      accepted.push(file);
    } else {
      addToast(`Unsupported file type for ${file.name}`);
    }
  }
  return accepted;
}

/** Extracts the `<img src alt>` an `<img>` element drag carries as its
 * `text/html` transfer payload and fetches it as a `File`, or returns
 * `null` when the drop wasn't that kind of drag (no `text/html`, no
 * `<img>` markup in it) or the fetch failed. Toasts the specific failure
 * reason itself rather than letting the caller guess from a thrown error. */
async function fetchDraggedImageUrl(
  html: string,
  supportFileTypes: string[],
  addToast: ToastFn
): Promise<File | null> {
  const srcMatch = html.match(/src="?([^"\s]+)"?\s*/);
  if (!srcMatch) {
    return null;
  }
  const url = srcMatch[1].replace("&amp;", "&"); // reverse HTML entity-encoding
  const altMatch = html.match(/alt="?([^"]+)"?\s*/);
  const name = altMatch && altMatch.length > 1 ? altMatch[1] : "";

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    const file = new File([blob], name, { type: blob.type });
    if (!supportFileTypes.includes(file.type)) {
      addToast(`Unsupported file type for ${file.name}`);
      return null;
    }
    return file;
  } catch (error) {
    const message =
      error instanceof Error && error.message === "Failed to fetch"
        ? "Unable to import image: failed to fetch"
        : "Unable to import image";
    addToast(message);
    return null;
  }
}

function preventBrowserHandling(event: React.DragEvent<HTMLDivElement>) {
  event.preventDefault();
  event.stopPropagation();
}

function useImageDrop(
  onImageDrop: (event: ImageDropEvent) => void,
  supportFileTypes = ["image/jpeg", "image/gif", "image/png", "image/webp"]
) {
  const { addToast } = useToasts();
  const [dragging, setDragging] = useState(false);

  function onDragEnter(event: React.DragEvent<HTMLDivElement>) {
    preventBrowserHandling(event);
    setDragging(true);
  }

  function onDragLeave(event: React.DragEvent<HTMLDivElement>) {
    preventBrowserHandling(event);
    setDragging(false);
  }

  function onDragOver(event: React.DragEvent<HTMLDivElement>) {
    preventBrowserHandling(event);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  }

  async function onDrop(event: React.DragEvent<HTMLDivElement>) {
    preventBrowserHandling(event);

    const html = event.dataTransfer?.getData("text/html");
    const draggedImage = html
      ? await fetchDraggedImageUrl(html, supportFileTypes, addToast)
      : null;

    const droppedFiles = event.dataTransfer?.files;
    const browserFiles = droppedFiles
      ? collectSupportedFiles(droppedFiles, supportFileTypes, addToast)
      : [];

    const files = draggedImage ? [draggedImage, ...browserFiles] : browserFiles;
    const dropPosition = new Vector2(event.clientX, event.clientY);
    onImageDrop({ files, dropPosition });
    setDragging(false);
  }

  return {
    dragging,
    containerListeners: { onDragEnter },
    overlayListeners: { onDragLeave, onDragOver, onDrop },
  };
}

export default useImageDrop;
