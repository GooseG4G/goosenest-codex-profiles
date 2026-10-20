export function useCollapseAnimation() {
  const animations = new WeakMap<HTMLElement, Animation>();

  function animate(element: Element, opening: boolean, done: () => void) {
    const target = element as HTMLElement;
    animations.get(target)?.cancel();
    const height = target.scrollHeight;
    const animation = target.animate(
      [
        { height: opening ? "0px" : `${height}px`, opacity: opening ? 0 : 1 },
        { height: opening ? `${height}px` : "0px", opacity: opening ? 1 : 0 },
      ],
      {
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 160,
        easing: opening
          ? "cubic-bezier(0, 0, 0.2, 1)"
          : "cubic-bezier(0.4, 0, 1, 1)",
        fill: "none",
      },
    );
    animations.set(target, animation);
    void animation.finished
      .then(() => {
        animation.commitStyles();
        animation.cancel();
        animations.delete(target);
        if (opening) {
          target.style.removeProperty("height");
          target.style.removeProperty("opacity");
        }
        done();
      })
      .catch(() => {
        // Vue removes an interrupted transition node after cancellation.
      });
  }

  function cancel(element: Element) {
    animations.get(element as HTMLElement)?.cancel();
  }

  return { animate, cancel };
}
