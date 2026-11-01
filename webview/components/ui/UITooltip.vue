<script setup lang="ts">
import { nextTick, onUnmounted, shallowRef, useTemplateRef, watch, type CSSProperties } from 'vue'

interface Props {
  anchor: HTMLElement | null
  id: string
  text: string
  open: boolean
  instant?: boolean
  placement?: 'horizontal' | 'above'
}

const props = withDefaults(defineProps<Props>(), {
  placement: 'above',
  instant: false,
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
    const edge = 7
  let top: number
  let left: number

  if (props.placement === 'horizontal') {
    const rightSpace = window.innerWidth - anchorRect.right
    const leftSpace = anchorRect.left
    const placeRight = rightSpace >= tipRect.width + gap || rightSpace >= leftSpace
    top = anchorRect.top + (anchorRect.height - tipRect.height) / 2
    left = placeRight ? anchorRect.right + gap : anchorRect.left - tipRect.width - gap
  } else {
    // Prefer the vertical axis for tooltips; flip below only when above is tight.
    const aboveSpace = anchorRect.top
    const belowSpace = window.innerHeight - anchorRect.bottom
    const placeAbove = aboveSpace >= tipRect.height + gap || aboveSpace >= belowSpace
    top = placeAbove ? anchorRect.top - tipRect.height - gap : anchorRect.bottom + gap
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
        :class="{ instant }"
        role="tooltip"
        :style="position"
      >{{ text }}</span>
    </Transition>
  </Teleport>
</template>

<style scoped>
.tooltip {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  max-width: min(240px, calc(100vw - 14px));
  padding: 5px 8px;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
  background: var(--color-bg-overlay);
  box-shadow: var(--shadow-overlay);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.3;
  white-space: nowrap;
  pointer-events: none;
}
.tooltip-enter-active { transition: opacity 80ms ease 420ms; }
.tooltip-enter-active.tooltip.instant { transition-delay: 0ms; }
.tooltip-leave-active { transition: opacity 70ms ease; }
.tooltip-enter-from, .tooltip-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .tooltip-enter-active, .tooltip-leave-active { transition: none; }
}
</style>
