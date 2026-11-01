import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UsageDisplay from './UsageDisplay.vue'

describe('UsageDisplay', () => {
  it('shows only reset loading skeletons when the first snapshot is pending', () => {
    const wrapper = mount(UsageDisplay, { props: { usage: null, busy: true } })

    expect(wrapper.text()).toContain('Fetching usage limits…')
    expect(wrapper.find('.usage-card:not(.unavailable)').exists()).toBe(false)
  })

  it('keeps known usage values visible while a stale snapshot refreshes', () => {
    const wrapper = mount(UsageDisplay, {
      props: {
        busy: true,
        usage: {
          fetchedAt: '2026-10-31T20:00:00.000Z',
          updatedAt: '2026-10-31T20:00:00.000Z',
          status: 'stale',
          primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 2_000_000_000 },
        },
      },
    })

    expect(wrapper.text()).toContain('75% left')
    expect(wrapper.find('.usage-card .skeleton').exists()).toBe(false)
    expect(wrapper.find('.usage-card.stale').exists()).toBe(true)
  })

})
