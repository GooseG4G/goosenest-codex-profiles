import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UsageResetWidget from './UsageResetWidget.vue'

const credit = { id: 'reset-1', status: 'available', title: 'Full reset' }

describe('UsageResetWidget', () => {
  it('is inert with no available credits', () => {
    const wrapper = mount(UsageResetWidget, { props: { credits: [{ ...credit, status: 'redeemed' }] } })
    expect(wrapper.text()).toContain('0 available')
    expect(wrapper.find('button.reset-summary').attributes('disabled')).toBeDefined()
  })

  it('shows reset action and emits only after confirmation', async () => {
    const wrapper = mount(UsageResetWidget, { props: { credits: [credit] } })
    await wrapper.find('button.reset-summary').trigger('click')
    expect(wrapper.text()).toContain('Full reset (Weekly + 5 hr)')
    expect(wrapper.text()).toContain('Use reset')
    await wrapper.get('button.reset-action').trigger('click')
    const confirm = document.body.querySelector('[role="dialog"] .footer .is-primary') as HTMLButtonElement | null
    expect(confirm).not.toBeNull()
    confirm?.click()
    expect(wrapper.emitted('useReset')).toEqual([['reset-1']])
  })

  it('shows reset expiry as a relative duration', async () => {
    const wrapper = mount(UsageResetWidget, {
      props: {
        credits: [{
          ...credit,
          resetType: 'codexRateLimits',
          expiresAt: Math.floor((Date.now() + 3_660_000) / 1000),
        }],
      },
    })
    await wrapper.find('button.reset-summary').trigger('click')
    expect(wrapper.text()).toContain('Expires in 1h 1m')
  })

  it('keeps the widget usable while the selected reset is pending', async () => {
    const wrapper = mount(UsageResetWidget, { props: { credits: [credit], pendingId: 'reset-1', stale: true } })
    await wrapper.find('button.reset-summary').trigger('click')
    expect(wrapper.text()).toContain('Using…')
    expect(wrapper.get('button.reset-action').attributes('disabled')).toBeDefined()
  })
})
