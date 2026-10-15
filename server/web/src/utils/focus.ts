function suppressFocusRing(element: HTMLElement) {
  element.dataset.focusRestored = "";
  element.addEventListener(
    "blur",
    () => {
      delete element.dataset.focusRestored;
    },
    { once: true },
  );
}

export function installFocusPolicy() {
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(
              'button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
            )
          : null;
      if (target) suppressFocusRing(target);
    },
    true,
  );
}

export function restoreFocus(element: HTMLElement | null) {
  if (!element?.isConnected) return;
  suppressFocusRing(element);
  element.focus({ preventScroll: true });
}
