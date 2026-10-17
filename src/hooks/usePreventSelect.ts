const NO_SELECT_CLASS = "no-select";

function clearNativeSelection() {
  window?.getSelection()?.removeAllRanges();
  // Legacy IE selection API.
  // @ts-ignore
  document?.selection?.empty();
}

function usePreventSelect() {
  const disable = () => {
    clearNativeSelection();
    document.body.classList.add(NO_SELECT_CLASS);
  };
  const enable = () => {
    document.body.classList.remove(NO_SELECT_CLASS);
  };
  return [disable, enable] as const;
}

export default usePreventSelect;
