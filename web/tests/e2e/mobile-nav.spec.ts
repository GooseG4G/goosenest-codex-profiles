import { test, expect } from "@playwright/test";

const fixtureTime = "2026-10-17T12:00:00.000Z";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const payload = path.endsWith("/sessions/current")
      ? {
          user_id: "user-1",
          username: "test@example.com",
          role: "administrator",
        }
      : path.endsWith("/devices")
        ? { meta: { type: "devices", href: "/devices", total: 0 }, items: [] }
        : path.endsWith("/profiles")
          ? {
              meta: { type: "profiles", href: "/profiles", total: 1 },
              items: [
                {
                  meta: { type: "profile", href: "/profiles/profile-1" },
                  profile_id: "profile-1",
                  name: "profile@example.com",
                  enabled: true,
                  auth_status: "authorized",
                  usage: null,
                  usage_updated_at: null,
                  plan_type: "free",
                  plan_updated_at: null,
                  last_used_at: null,
                },
              ],
            }
          : path.endsWith("/usage/limits")
            ? {
                plan_type: "free",
                primary: {
                  used_percent: 25,
                  window_duration_minutes: 300,
                  resets_at: Math.floor(Date.now() / 1000) + 3600,
                },
                secondary: null,
                updated_at: fixtureTime,
                stale: false,
                refreshing: false,
              }
            : path.endsWith("/usage/resets")
              ? {
                  available_count: 1,
                  credits: [
                    {
                      reset_id: "reset-1",
                      status: "available",
                      reset_type: "codexRateLimits",
                      title: "Full reset",
                      description: null,
                      granted_at: Math.floor(Date.now() / 1000),
                      expires_at: null,
                    },
                  ],
                  updated_at: fixtureTime,
                  stale: false,
                  refreshing: false,
                }
              : path.endsWith("/users")
                ? {
                    meta: { type: "users", href: "/users", total: 0 },
                    items: [],
                  }
                : {};
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
});

test("row hover owns the switch action context", async ({ page }) => {
  await page.goto("/profiles");
  const row = page.locator(".profile-row");
  const switchControl = row.locator('[role="switch"]');
  await switchControl.hover();
  await expect(row).toHaveCSS("background-color", "rgb(28, 29, 30)");
  await expect(switchControl).toHaveCSS("background-color", "rgb(41, 42, 43)");
});

test("mobile navigation is a bottom bar with stable hit targets", async ({
  page,
}) => {
  await page.goto("/me/devices");
  const sidebar = page.locator(".sidebar");
  await expect(sidebar).toBeVisible();
  const box = await sidebar.boundingBox();
  expect(box).not.toBeNull();
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  expect(box!.y + box!.height).toBeGreaterThanOrEqual(viewportHeight);
  expect(box!.y).toBeGreaterThan(viewportHeight - box!.height - 1);
  expect(box!.height).toBeLessThanOrEqual(61);
  for (const link of await page.locator(".sidebar nav a").all()) {
    const linkBox = await link.boundingBox();
    expect(linkBox?.width).toBeGreaterThanOrEqual(44);
    expect(linkBox?.height).toBeGreaterThanOrEqual(44);
  }
});

test("mobile account popover opens above the bottom navigation", async ({
  page,
}) => {
  await page.goto("/profiles");
  const account = page.getByRole("button", { name: /Account:/ });
  await account.click();
  const panel = page.getByRole("menu");
  await expect(panel).toBeVisible();
  const [accountBox, panelBox] = await Promise.all([
    account.boundingBox(),
    panel.boundingBox(),
  ]);
  expect(accountBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.y + panelBox!.height).toBeLessThan(accountBox!.y);
  expect(panelBox!.y).toBeGreaterThanOrEqual(0);
});

test("profile and user toolbars use the same search action gap", async ({
  page,
}) => {
  async function toolbarGap(path: string) {
    await page.goto(path);
    const children = page.locator(".toolbar > *");
    const [search, action] = await Promise.all([
      children.nth(0).boundingBox(),
      children.nth(1).boundingBox(),
    ]);
    expect(search).not.toBeNull();
    expect(action).not.toBeNull();
    return action!.x - (search!.x + search!.width);
  }

  const profileGap = await toolbarGap("/profiles");
  const userGap = await toolbarGap("/users");
  expect(profileGap).toBe(10);
  expect(userGap).toBe(profileGap);
});

test("usage reset badge keeps its color while stale and summary has no pressed state", async ({
  page,
}) => {
  await page.clock.install({ time: new Date(fixtureTime) });
  await page.goto("/profiles");
  await page
    .getByRole("button", { name: "Show usage for profile@example.com" })
    .click();

  const summary = page.getByRole("button", { name: /Usage limit resets/ });
  const badge = summary.locator(".available");
  await expect(badge).toHaveText("1 available");
  await expect(badge).not.toHaveClass(/is-stale/);
  await expect(badge).toHaveCSS("background-color", "rgb(0, 107, 44)");
  await expect(badge).toHaveCSS("color", "rgb(240, 255, 244)");
  const green = await badge.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  const summaryBox = await summary.boundingBox();
  expect(summaryBox).not.toBeNull();
  await page.mouse.move(summaryBox!.x + 20, summaryBox!.y + 20);
  const widget = page.locator(".reset-widget");
  await expect(widget).toHaveCSS("background-color", "rgb(41, 42, 43)");
  await expect(summary).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const chevron = summary.locator(".chevron");
  await expect(chevron).toHaveCSS(
    "transform",
    "matrix(1.06, 0, 0, 1.06, 0, 0)",
  );
  await expect(chevron).toHaveCSS("color", "rgb(237, 237, 237)");
  const beforePress = await summary.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await page.mouse.down();
  await expect(summary).toHaveCSS("transform", "none");
  await expect(summary).toHaveCSS("background-color", beforePress);
  await page.mouse.up();

  await summary.click();
  const resetButton = page.getByRole("button", { name: "Use reset" });
  await expect(resetButton).toHaveCSS("border-radius", "999px");
  await expect(resetButton).toHaveCSS(
    "background-color",
    "rgb(237, 237, 237)",
  );
  await expect(resetButton).toHaveCSS("color", "rgb(23, 23, 23)");
  const [badgeBox, resetButtonBox] = await Promise.all([
    badge.boundingBox(),
    resetButton.boundingBox(),
  ]);
  expect(badgeBox).not.toBeNull();
  expect(resetButtonBox).not.toBeNull();
  expect(badgeBox!.width).toBeCloseTo(84, 0);
  expect(badgeBox!.height).toBeCloseTo(24, 0);
  expect(resetButtonBox!.width).toBeGreaterThanOrEqual(72);
  expect(resetButtonBox!.width).toBeLessThan(100);
  expect(resetButtonBox!.height).toBeCloseTo(30, 0);
  const widgetBox = await widget.boundingBox();
  expect(widgetBox).not.toBeNull();
  expect(
    widgetBox!.x + widgetBox!.width -
      (resetButtonBox!.x + resetButtonBox!.width),
  ).toBeCloseTo(15, 0);
  await expect(page.locator(".credits-list")).toHaveCSS(
    "border-top-width",
    "0px",
  );

  await page.clock.fastForward(180_000);
  await expect(badge).toHaveClass(/is-stale/);
  await expect(badge).toHaveCSS("background-color", green);
  await expect(badge).toHaveCSS("color", "rgba(0, 0, 0, 0)");
  const animation = await badge.evaluate(
    (element) => getComputedStyle(element, "::after").animationName,
  );
  expect(animation).toContain("available-shimmer");
});

test("closing the current usage panel has no rebound on animation frames", async ({
  page,
}) => {
  await page.goto("/profiles");
  const toggle = page.getByRole("button", {
    name: "Show usage for profile@example.com",
  });
  const item = page.locator(".profile-item");
  await toggle.click();
  await expect(page.locator(".usage-collapse")).toBeVisible();
  const heights = await item.evaluate(async (element) => {
    const values: number[] = [];
    const toggle = element.querySelector<HTMLButtonElement>(".row-hit");
    toggle?.click();
    const startedAt = performance.now();
    await new Promise<void>((resolve) => {
      const sample = () => {
        values.push(element.getBoundingClientRect().height);
        if (performance.now() - startedAt < 260) requestAnimationFrame(sample);
        else resolve();
      };
      requestAnimationFrame(sample);
    });
    return values;
  });
  expect(heights.length).toBeGreaterThan(8);
  for (let index = 1; index < heights.length; index += 1) {
    expect(heights[index]).toBeLessThanOrEqual(heights[index - 1]! + 0.25);
  }
  expect(heights.at(-1)).toBeCloseTo(68, 0);
});

test("switching expanded profiles keeps opposing animations monotonic", async ({
  page,
}) => {
  await page.route("**/api/v1/profiles", async (route) => {
    const profile = (id: string, name: string) => ({
      meta: { type: "profile", href: `/profiles/${id}` },
      profile_id: id,
      name,
      enabled: true,
      auth_status: "authorized",
      usage: null,
      usage_updated_at: null,
      plan_type: "free",
      plan_updated_at: null,
      last_used_at: null,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        meta: { type: "profiles", href: "/profiles", total: 2 },
        items: [
          profile("profile-1", "profile@example.com"),
          profile("profile-2", "second@example.com"),
        ],
      }),
    });
  });
  await page.goto("/profiles");
  await page
    .getByRole("button", { name: "Show usage for profile@example.com" })
    .click();
  await expect(page.locator(".usage-collapse")).toBeVisible();
  await page.waitForTimeout(180);

  const frames = await page.locator(".profile-item").first().evaluate(
    async (first) => {
      const items = [...document.querySelectorAll<HTMLElement>(".profile-item")];
      const second = items[1]!;
      const values: Array<{ closing: number; opening: number }> = [];
      second.querySelector<HTMLButtonElement>(".row-hit")?.click();
      const startedAt = performance.now();
      await new Promise<void>((resolve) => {
        const sample = () => {
          values.push({
            closing: first.getBoundingClientRect().height,
            opening: second.getBoundingClientRect().height,
          });
          if (performance.now() - startedAt < 260) requestAnimationFrame(sample);
          else resolve();
        };
        requestAnimationFrame(sample);
      });
      return values;
    },
  );
  expect(frames.length).toBeGreaterThan(8);
  for (let index = 1; index < frames.length; index += 1) {
    expect(frames[index]!.closing).toBeLessThanOrEqual(
      frames[index - 1]!.closing + 0.25,
    );
    expect(frames[index]!.opening).toBeGreaterThanOrEqual(
      frames[index - 1]!.opening - 0.25,
    );
  }
  expect(frames.at(-1)!.closing).toBeCloseTo(68, 0);
  expect(frames.at(-1)!.opening).toBeGreaterThan(68);
});

test("empty usage reset badge shimmers over its gray base", async ({
  page,
}) => {
  await page.clock.install({ time: new Date(fixtureTime) });
  await page.route(
    "**/api/v1/profiles/profile-1/usage/resets",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          available_count: 0,
          credits: [],
          updated_at: new Date(Date.now() - 180_000).toISOString(),
          stale: true,
          refreshing: true,
        }),
      });
    },
  );
  await page.goto("/profiles");
  await page
    .getByRole("button", { name: "Show usage for profile@example.com" })
    .click();

  const badge = page.locator(".reset-widget .available");
  await expect(badge).toHaveText("0 available");
  const summary = page.getByRole("button", {
    name: "No usage limit resets available",
  });
  await expect(summary).toBeDisabled();
  await expect(summary.locator(".chevron")).toBeVisible();
  await expect(badge).toHaveClass(/is-stale/);
  const gray = await badge.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await expect(badge).toHaveCSS("background-color", gray);
  await expect(badge).toHaveCSS("color", "rgba(0, 0, 0, 0)");
  const animation = await badge.evaluate(
    (element) => getComputedStyle(element, "::after").animationName,
  );
  expect(animation).toContain("available-shimmer");
});

test("role uses the custom keyboard-accessible select", async ({ page }) => {
  await page.goto("/users");
  await page.getByRole("button", { name: "Add user" }).click();

  const select = page.getByRole("combobox");
  await expect(select).toHaveText("User");
  await expect(page.locator("select")).toHaveCount(0);
  await select.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(select).toHaveText("Administrator");
  await expect(select).toHaveAttribute("aria-expanded", "false");
  await expect(select).toBeFocused();
  await expect(select).toHaveCSS("box-shadow", "none");

  await select.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByText("Role", { exact: true }).click();
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(select).toHaveAttribute("aria-expanded", "false");
});

test("profile reauthorization waits for explicit confirmation", async ({
  page,
}) => {
  let authRequests = 0;
  await page.route("**/api/v1/profiles", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        meta: { type: "profiles", href: "/profiles", total: 1 },
        items: [
          {
            meta: { type: "profile", href: "/profiles/profile-1" },
            profile_id: "profile-1",
            name: "profile@example.com",
            enabled: true,
            auth_status: "expired",
            usage: null,
            usage_updated_at: null,
            plan_type: "free",
            plan_updated_at: null,
            last_used_at: null,
          },
        ],
      }),
    });
  });
  await page.route("**/api/v1/device/auth?profile_id=profile-1", async (route) => {
    authRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uid: "auth-1",
        one_time_code: "ABCD-EFGH",
        verification_url: "https://example.com/device",
        expires_in: 900,
        status: "pending",
        profile_id: "profile-1",
      }),
    });
  });

  await page.goto("/profiles");
  await page
    .getByRole("button", { name: "Sign in to profile@example.com again" })
    .click();

  await expect(page.getByRole("dialog")).toContainText("Sign in again");
  await expect(page.getByRole("dialog")).toContainText(
    "Sign in to reconnect profile@example.com.",
  );
  await expect(page.getByLabel("Copy code")).toHaveCount(0);
  expect(authRequests).toBe(0);

  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByRole("button", { name: "Copy code" })).toContainText(
    "ABCD-EFGH",
  );
  expect(authRequests).toBe(1);
});

test("sidebar navigation does not stack surface and icon transforms", async ({
  page,
}) => {
  await page.goto("/me/devices");
  const link = page.locator('.sidebar nav a[href="/me/devices"]');
  await link.hover();
  const icon = link.locator("svg");
  await expect(icon).toHaveCSS("transform", "none");
  await expect(link).toHaveCSS("background-color", "rgb(41, 42, 43)");
});

test("row action spacing is symmetric and delete owns the press transform", async ({
  page,
}) => {
  await page.goto("/profiles");
  const row = page.locator(".profile-row");
  const indicator = row.locator(".row-indicator");
  const statusDot = row.locator(".dot");
  const switchControl = row.locator('[role="switch"]');
  const divider = row.locator(".actions > i");
  const deleteButton = row.locator('button[aria-label^="Delete"]');
  const [indicatorBox, statusBox, switchBox, dividerBox, deleteBox] = await Promise.all([
    indicator.boundingBox(),
    statusDot.boundingBox(),
    switchControl.boundingBox(),
    divider.boundingBox(),
    deleteButton.boundingBox(),
  ]);
  expect(indicatorBox).not.toBeNull();
  expect(statusBox).not.toBeNull();
  expect(switchBox).not.toBeNull();
  expect(dividerBox).not.toBeNull();
  expect(deleteBox).not.toBeNull();
  const leftGap = dividerBox!.x - (switchBox!.x + switchBox!.width);
  const rightGap = deleteBox!.x - (dividerBox!.x + dividerBox!.width);
  const indicatorToStatusGap = statusBox!.x - (
    indicatorBox!.x + indicatorBox!.width
  );
  const copyBox = await row.locator(".copy").boundingBox();
  expect(copyBox).not.toBeNull();
  const statusToCopyGap = copyBox!.x - (statusBox!.x + statusBox!.width);
  expect(indicatorBox!.x).toBeLessThan(statusBox!.x);
  expect(indicatorToStatusGap).toBeCloseTo(10, 1);
  expect(statusToCopyGap).toBeCloseTo(indicatorToStatusGap, 1);
  expect(leftGap).toBeGreaterThanOrEqual(rightGap + 3);

  await deleteButton.hover();
  await expect(deleteButton.locator(".icon")).toHaveCSS("transform", "none");
  await expect(deleteButton).toHaveCSS(
    "transform",
    "matrix(1.04, 0, 0, 1.04, 0, 0)",
  );
});
