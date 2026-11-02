import { expect, test } from '@playwright/test'

test('responsive profile list fits a narrow webview without horizontal overflow', async ({ page }) => {
  await page.goto('/?state=ready')
  await expect(page.locator('.table-card')).toBeVisible()
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }))
  expect(dimensions.documentWidth).toBe(dimensions.viewportWidth)
})

test('profile header uses the Gateway table-header color token', async ({ page }) => {
  await page.goto('/?state=ready')
  await expect(page.locator('.list-header')).toHaveText('Profiles')
  await expect(page.locator('.list-header')).toHaveCSS('background-color', 'rgb(28, 29, 30)')
})

test('provider row hover and action motion match the Gateway controls', async ({ page }) => {
  await page.goto('/?state=ready')
  const provider = page.locator('.profile-item').filter({ hasText: 'Local provider' })
  const row = provider.locator('.profile-row')
  await row.hover({ position: { x: 220, y: 34 } })
  await expect(provider).toHaveCSS('background-color', 'rgb(28, 29, 30)')

  for (const button of [
    provider.getByRole('button', { name: 'Use profile' }),
    provider.getByRole('button', { name: 'Delete profile' }),
  ]) {
    await button.hover()
    await expect(button).toHaveCSS('transform', 'none')
    await expect(button.locator('.surface')).toHaveCSS('transform', 'matrix(1.04, 0, 0, 1.04, 0, 0)')
    await expect(button.locator('.content')).toHaveCSS('transform', 'matrix(1.04, 0, 0, 1.04, 0, 0)')
  }

  await row.click()
  const editButton = provider.getByRole('button', { name: 'Edit provider' })
  await editButton.hover()
  await expect(editButton).toHaveCSS('transform', 'none')
  await expect(editButton.locator('.surface')).toHaveCSS('transform', 'matrix(1.04, 0, 0, 1.04, 0, 0)')
  await expect(editButton.locator('.content')).toHaveCSS('transform', 'matrix(1.04, 0, 0, 1.04, 0, 0)')
})

test('selected provider switch stays muted while its row is hovered', async ({ page }) => {
  await page.goto('/?state=provider-active')
  const provider = page.locator('.profile-item').filter({ hasText: 'Local provider' })
  await expect(provider.locator('.profile-copy')).toContainText('provider.example, used just now')
  const switchButton = provider.getByRole('button', { name: 'Current profile' })
  await expect(switchButton).toBeDisabled()
  const restingColor = await switchButton.evaluate((element) => getComputedStyle(element).color)
  await provider.locator('.profile-row').hover({ position: { x: 220, y: 34 } })
  await expect(switchButton).toHaveCSS('color', restingColor)
  await expect(switchButton).toHaveCSS('transform', 'none')
})

test('ready state renders usage, reset windows, and provider transport', async ({ page }) => {
  await page.goto('/?state=ready')
  await expect(page.locator('.profile-item')).toHaveCount(2)
  await expect(page.locator('.profile-item').first().locator('.profile-copy')).toContainText('Pro, used just now')
  const provider = page.locator('.profile-item').filter({ hasText: 'Local provider' })
  await expect(provider.locator('.profile-copy')).toContainText('provider.example, used 1d ago')
  await expect(provider.locator('.disclosure')).toBeVisible()
  await expect(provider.getByRole('button', { name: 'Use profile' })).toBeVisible()
  await expect(provider.getByRole('button', { name: 'Delete profile' })).toBeVisible()
  await expect(provider.getByRole('button', { name: 'Edit provider' })).toHaveCount(0)
  await provider.locator('.profile-row').click()
  await expect(provider.getByRole('region', { name: 'Provider details' })).toBeVisible()
  await expect(provider.locator('.provider-endpoint')).toHaveText('https://provider.example/v1')
  await expect(provider.locator('.provider-transport')).toHaveText('WebSocket')
  await expect(provider.getByRole('button', { name: 'Edit provider' })).toBeVisible()
  await page.locator('.profile-row').first().click()
  await expect(page.locator('.usage-card')).toHaveCount(2)
  await expect(page.locator('.usage-card').first()).toContainText('58% left')
  await expect(page.locator('.usage-card').first()).toHaveCSS('background-color', 'rgb(36, 37, 38)')
  await expect(page.locator('.track').first()).toHaveCSS('background-color', 'rgb(59, 59, 59)')
  await expect(page.locator('.track i').first()).toHaveCSS('background-color', 'rgb(170, 170, 170)')
  const resetWidget = page.locator('.reset-widget')
  await expect(resetWidget).toHaveCSS('background-color', 'rgb(36, 37, 38)')
  const spacing = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('.usage-card')]
    const reset = document.querySelector<HTMLElement>('.reset-widget')!
    return {
      limits: cards[1].getBoundingClientRect().top - cards[0].getBoundingClientRect().bottom,
      reset: reset.getBoundingClientRect().top - cards[1].getBoundingClientRect().bottom,
    }
  })
  expect(spacing.reset).toBeCloseTo(spacing.limits, 1)
  await resetWidget.hover()
  await expect(resetWidget).toHaveCSS('background-color', 'rgb(41, 42, 43)')
  await resetWidget.click()
  await expect(resetWidget).toContainText('Full reset (Weekly + 5 hr)')
  await expect(resetWidget).toContainText('Expires in 2h')
  await expect(resetWidget).toHaveCSS('background-color', 'rgb(41, 42, 43)')
})

test('profile details use measured collapse animation across panel widths', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  for (const width of [480, 320]) {
    await page.setViewportSize({ width, height: 700 })
    await page.goto('/?state=ready')
    const provider = page.locator('.profile-item').filter({ hasText: 'Local provider' })
    const openingAnimation = await provider.locator('.profile-row').evaluate(async (row) => {
      row.querySelector<HTMLButtonElement>('.item-action')?.click()
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const element = row.closest('.profile-item')?.querySelector<HTMLElement>('.details-collapse')
      const animation = element?.getAnimations()[0]
      const effect = animation?.effect as KeyframeEffect | null
      return {
        duration: Number(effect?.getTiming().duration ?? 0),
        heights: effect?.getKeyframes().map((frame) => frame.height),
      }
    })
    const details = provider.locator('.details-collapse')
    await expect(details).toBeVisible()
    expect(openingAnimation.duration).toBe(160)
    expect(openingAnimation.heights?.[0]).toBe('0px')
    expect(openingAnimation.heights?.[1]).not.toBe('360px')
    await expect(details).not.toHaveCSS('height', '360px')
    await page.waitForTimeout(180)
    await expect(details).toHaveCSS('height', `${await details.evaluate((element) => element.scrollHeight)}px`)

    const closingAnimation = await provider.locator('.profile-row').evaluate(async (row) => {
      row.querySelector<HTMLButtonElement>('.item-action')?.click()
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const element = row.closest('.profile-item')?.querySelector<HTMLElement>('.details-collapse')
      const animation = element?.getAnimations()[0]
      const effect = animation?.effect as KeyframeEffect | null
      return effect?.getKeyframes().map((frame) => frame.height)
    })
    expect(closingAnimation?.at(-1)).toBe('0px')
    await expect(details).toBeHidden()
  }
})

test('empty state explains that no profiles are available', async ({ page }) => {
  await page.goto('/?state=empty')
  await expect(page.locator('.empty')).toHaveText('No profiles yet')
})

test('loading state shows an explicit unknown plan', async ({ page }) => {
  await page.goto('/?state=loading')
  await expect(page.getByText('Unknown', { exact: true })).toBeVisible()
})

test('device sign-in presents a copyable code without a terminal', async ({ page }) => {
  await page.goto('/?state=auth')
  await expect(page.getByRole('heading', { name: 'Sign in to Codex' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy code' })).toContainText('ABCD-EFGH')
  const openButton = page.getByRole('button', { name: 'Go to OpenAI' })
  await expect(openButton).toBeEnabled()
  await expect(page.getByText('pending, expires in about 15 minutes')).toBeVisible()
  await openButton.click()
  await expect(openButton).toHaveAttribute('aria-busy', 'true')
  await expect(openButton).toContainText('Go to OpenAI')
})

test('device sign-in uses shimmer pending controls instead of loading copy', async ({ page }) => {
  await page.goto('/?state=auth-loading')
  await expect(page.getByText('Loading…')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Waiting for device code' })).toBeDisabled()
  const openButton = page.getByRole('button', { name: 'Go to OpenAI' })
  await expect(openButton).toHaveAttribute('aria-busy', 'true')
  await expect(openButton).toContainText('Go to OpenAI')
  await page.waitForTimeout(220)
  await expect(openButton).toHaveClass(/is-pending/)
})

test('completed device auth state adds the profile to the visible list', async ({ page }) => {
  await page.goto('/?state=auth')
  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent('message', { data: {
      type: 'state',
      profiles: [{ id: 'new-profile', kind: 'default', name: 'new@example.com', active: true, authExpired: false, lastUsedAt: new Date().toISOString(), usage: null }],
      awaitingSignIn: false,
      addError: '',
      deviceAuth: null,
    } }))
  })
  await expect(page.locator('.profile-item')).toHaveCount(1)
  await expect(page.getByText('new@example.com')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('reauth completion updates the expired profile in the visible list', async ({ page }) => {
  await page.goto('/?state=ready')
  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent('message', { data: {
      type: 'state',
      profiles: [{ id: 'expired-profile', kind: 'default', name: 'expired@example.com', active: false, authExpired: true, lastUsedAt: new Date(Date.now() - 86_400_000).toISOString(), usage: null, plan: { planType: 'Pro', updatedAt: null } }],
      awaitingSignIn: false,
      addError: '',
      deviceAuth: null,
    } }))
  })
  const profile = page.locator('.profile-item').filter({ hasText: 'expired@example.com' })
  await profile.getByRole('button', { name: 'Use profile' }).click()
  await expect(page.getByRole('dialog')).toContainText('Re-authenticate')
  await expect(page.getByRole('button', { name: 'Re-authenticate' }).locator('.line-button-surface')).toHaveCSS('background-color', 'rgb(237, 237, 237)')
  await page.getByRole('button', { name: 'Re-authenticate' }).click()
  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent('message', { data: {
      type: 'state',
      profiles: [{ id: 'expired-profile', kind: 'default', name: 'expired@example.com', active: true, authExpired: false, lastUsedAt: new Date().toISOString(), usage: null, plan: { planType: 'Pro', updatedAt: null } }],
      awaitingSignIn: false,
      addError: '',
      deviceAuth: null,
    } }))
  })
  await expect(profile.locator('.status-dot.expired')).toHaveCount(0)
  await expect(profile.locator('.profile-copy')).toContainText('just now')
})

test('expired profile replaces disclosure chevron with reauth indicator', async ({ page }) => {
  await page.goto('/?state=ready')
  await expect(page.locator('.profile-item').first()).toBeVisible()
  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent('message', { data: {
      type: 'state',
      profiles: [{ id: 'expired-profile', kind: 'default', name: 'expired@example.com', active: false, authExpired: true, lastUsedAt: null, usage: { limits: { primary: { usedPercent: 20 } }, resets: null }, plan: { planType: 'Pro' } }],
      awaitingSignIn: false,
      addError: '',
      deviceAuth: null,
    } }))
  })
  const profile = page.locator('.profile-item').filter({ hasText: 'expired@example.com' })
  await expect(profile.locator('.reauth-icon')).toBeVisible()
  await expect(profile.locator('.chevron-icon')).toHaveCount(0)
  await expect(profile.getByRole('button', { name: 'Sign in to expired@example.com again' })).toBeVisible()
})

test('add profile confirmation uses the primary action style', async ({ page }) => {
  await page.goto('/?state=ready')
  await page.getByRole('button', { name: 'Add profile' }).click()
  await expect(page.getByRole('dialog')).toContainText('Add profile')
  await expect(page.getByRole('button', { name: 'Sign in' }).locator('.line-button-surface')).toHaveCSS('background-color', 'rgb(237, 237, 237)')
})

test('add profile keeps confirmation open while device auth is starting', async ({ page }) => {
  await page.goto('/?state=ready')
  await page.getByRole('button', { name: 'Add profile' }).click()
  const dialog = page.getByRole('dialog')
  const signIn = page.getByRole('button', { name: 'Sign in' })
  await signIn.click()
  await expect(dialog).toBeVisible()
  await expect(signIn).toHaveAttribute('aria-busy', 'true')
  await expect(signIn).toHaveClass(/is-pending/)
})

test('switch confirmation is concise and uses the primary action style', async ({ page }) => {
  await page.goto('/?state=ready')
  const provider = page.locator('.profile-item').filter({ hasText: 'Local provider' })
  await provider.getByRole('button', { name: 'Use profile' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Switch profile?')
  await expect(dialog).toContainText('Use Local provider for new Codex requests?')
  await expect(dialog).not.toContainText('WebSocket')
  await expect(page.getByRole('button', { name: 'Switch' }).locator('.line-button-surface')).toHaveCSS('background-color', 'rgb(237, 237, 237)')
})

test('provider form exposes the Responses and WebSocket transport selector', async ({ page }) => {
  await page.goto('/?state=empty')
  await page.getByRole('button', { name: 'Add provider' }).click()
  await expect(page.getByRole('group', { name: 'Provider transport' })).toBeVisible()
  const gaps = await page.evaluate(() => {
    const nameLabel = document.querySelector<HTMLElement>('.field-label')!.getBoundingClientRect()
    const nameInput = document.querySelector<HTMLElement>('.field-input')!.getBoundingClientRect()
    const transportLabel = document.querySelector<HTMLElement>('.transport-field .field-label')!.getBoundingClientRect()
    const transport = document.querySelector<HTMLElement>('.transport-switch')!.getBoundingClientRect()
    return {
      inputGap: nameInput.top - nameLabel.bottom,
      transportGap: transport.top - transportLabel.bottom,
    }
  })
  expect(gaps.transportGap).toBeCloseTo(gaps.inputGap, 1)
  await expect(page.getByRole('button', { name: 'HTTP/SSE' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'HTTP/SSE' })).toHaveCSS('font-weight', '600')
  await expect(page.locator('.transport-selection')).toHaveCSS('background-color', 'rgb(237, 237, 237)')
  await expect(page.getByRole('button', { name: 'HTTP/SSE' })).toHaveCSS('color', 'rgb(23, 23, 23)')
  const websocket = page.getByRole('button', { name: 'WebSocket' })
  await websocket.hover()
  await expect(websocket).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(websocket).toHaveCSS('color', 'rgb(237, 237, 237)')
  await page.getByRole('button', { name: 'WebSocket' }).click()
  await expect(page.getByRole('button', { name: 'WebSocket' })).toHaveAttribute('aria-pressed', 'true')
})
