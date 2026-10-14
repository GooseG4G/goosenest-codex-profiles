export function restoreFocus(element: HTMLElement | null) {
  if (!element?.isConnected) return;

  element.dataset.focusRestored = "";
  const clear = () => {
    delete element.dataset.focusRestored;
    element.removeEventListener("blur", clear);
    window.removeEventListener("keydown", clear, true);
    window.removeEventListener("pointerdown", clear, true);
  };

  element.addEventListener("blur", clear, { once: true });
  window.addEventListener("keydown", clear, { once: true, capture: true });
  window.addEventListener("pointerdown", clear, { once: true, capture: true });
  element.focus({ preventScroll: true });
}
