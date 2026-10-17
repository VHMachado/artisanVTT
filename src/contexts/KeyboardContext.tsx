import React, { useEffect } from "react";

import EventEmitter from "../helpers/EventEmitter";

const keyboardEvents = new EventEmitter();
keyboardEvents.setMaxListeners(100);

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
  );
}

/** Re-emits a raw `document` keyboard event on the shared bus, unless it
 * originated from a text input/textarea — typing a letter there must
 * never trigger a tool shortcut. */
function relayUnlessEditable(eventName: "keyDown" | "keyUp") {
  return (event: Event) => {
    if (!isEditableTarget(event.target)) {
      keyboardEvents.emit(eventName, event);
    }
  };
}

/** Installs the one document-level keyboard source used by shortcut hooks. */
export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handleKeyDown = relayUnlessEditable("keyDown");
    const handleKeyUp = relayUnlessEditable("keyUp");

    document.body.tabIndex = 1;
    document.body.addEventListener("keydown", handleKeyDown);
    document.body.addEventListener("keyup", handleKeyUp);

    return () => {
      document.body.removeEventListener("keydown", handleKeyDown);
      document.body.removeEventListener("keyup", handleKeyUp);
      document.body.tabIndex = 0;
    };
  }, []);

  return <>{children}</>;
}

/** Attaches `listener` to `eventName` for as long as the calling
 * component is mounted — shared by `useKeyboard`'s two optional
 * callbacks so neither repeats the same on/cleanup/off triple. */
function useKeyboardEvent(
  eventName: "keyDown" | "keyUp",
  listener?: (event: KeyboardEvent) => void
) {
  useEffect(() => {
    if (!listener) {
      return undefined;
    }
    keyboardEvents.on(eventName, listener);
    return () => {
      keyboardEvents.off(eventName, listener);
    };
  });
}

/** Subscribes a component to the shared keyboard event source. */
export function useKeyboard(
  onKeyDown?: (event: KeyboardEvent) => void,
  onKeyUp?: (event: KeyboardEvent) => void
) {
  useKeyboardEvent("keyDown", onKeyDown);
  useKeyboardEvent("keyUp", onKeyUp);
}

export function useBlur(onBlur: EventListenerOrEventListenerObject) {
  useEffect(() => {
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [onBlur]);
}
