import { onScopeDispose, watch, type WatchSource } from "vue";

type Layer = { id: symbol; dismiss: () => void };

const layers: Layer[] = [];

function onKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  const layer = layers.at(-1);
  if (!layer) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  layer.dismiss();
}

function remove(id: symbol) {
  const index = layers.findIndex((layer) => layer.id === id);
  if (index >= 0) layers.splice(index, 1);
  if (!layers.length) document.removeEventListener("keydown", onKeydown, true);
}

export function useEscapeLayer(active: WatchSource<boolean>, dismiss: () => void) {
  const id = Symbol("escape-layer");
  watch(
    active,
    (isActive) => {
      remove(id);
      if (!isActive) return;
      if (!layers.length) document.addEventListener("keydown", onKeydown, true);
      layers.push({ id, dismiss });
    },
    { immediate: true },
  );
  onScopeDispose(() => remove(id));
}
