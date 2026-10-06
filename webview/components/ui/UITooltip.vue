<script setup lang="ts">
import { nextTick, onUnmounted, shallowRef, useTemplateRef, watch, type CSSProperties } from 'vue'

interface Props {
  anchor: HTMLElement | null
  id: string
  text: string
  open: boolean
  placement?: 'horizontal' | 'above'
}

const props = withDefaults(defineProps<Props>(), {
  placement: 'above',
})

const tooltip = useTemplateRef<HTMLSpanElement>('tooltip')
const position = shallowRef<CSSProperties>({ top: '0', left: '0' })

function updatePosition() {
  const anchor = props.anchor
  const tip = tooltip.value
  if (!anchor || !tip) return

  const anchorRect = anchor.getBoundingClientRect()
  const tipRect = tip.getBoundingClientRect()
  const gap = 7
  const edge = 6
  let top: number
  let left: number

  if (props.placement === 'horizontal') {
    const placeRight = anchorRect.left < window.innerWidth - anchorRect.right
    top = anchorRect.top + (anchorRect.height - tipRect.height) / 2
    left = placeRight ? anchorRect.right + gap : anchorRect.left - tipRect.width - gap
  } else {
    top = anchorRect.top - tipRect.height - gap
    left = anchorRect.left + (anchorRect.width - tipRect.width) / 2
  }

  position.value = {
    top: `${Math.max(edge, Math.min(top, window.innerHeight - tipRect.height - edge))}px`,
    left: `${Math.max(edge, Math.min(left, window.innerWidth - tipRect.width - edge))}px`,
  }
}

watch(
  () => props.open,
  async (open, _previous, onCleanup) => {
    if (!open) return
    await nextTick()
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    onCleanup(() => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    })
  },
)

watch(() => [props.anchor, props.text], async () => {
  if (!props.open) return
  await nextTick()
  updatePosition()
})

onUnmounted(() => {
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="tooltip">
      <span
        v-if="open"
        :id="id"
        ref="tooltip"
        class="tooltip"
        role="tooltip"
        :style="position"
      >{{ text }}</span>
    </Transition>
  </Teleport>
</template>

<style scoped>
.tooltip {
  position: fixed;
  z-index: 1000;
  box-sizing: border-box;
  max-width: min(240px, calc(100vw - 12px));
  padding: 4px 7px;
  color: var(--vscode-editorHoverWidget-foreground, var(--vscode-foreground));
  border: 1px solid var(--vscode-editorHoverWidget-border, var(--vscode-widget-border));
  border-radius: 3px;
  background: var(--vscode-editorHoverWidget-background, var(--vscode-editorWidget-background, var(--vscode-editor-background)));
  box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgb(0 0 0 / 36%));
  font-size: 12px;
  font-weight: 400;
  line-height: 1.35;
  white-space: nowrap;
  pointer-events: none;
}
.tooltip-enter-active { transition: opacity 80ms ease 450ms; }
.tooltip-leave-active { transition: opacity 80ms ease; }
.tooltip-enter-from, .tooltip-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .tooltip-enter-active, .tooltip-leave-active { transition: none; }
}
</style>
