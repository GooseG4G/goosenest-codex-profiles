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
                last_used_at: null,
              },
            ],
          }
        : path.endsWith("/devices")
          ? { meta: { type: "devices", href: "/devices", total: 0 }, items: [] }
          : path.endsWith("/users")
            ? { meta: { type: "users", href: "/users", total: 0 }, items: [] }
            : {};
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
});

test("desktop delete keeps its hover scale", async ({ page }) => {
  await page.goto("/profiles");
  const deleteButton = page.locator(
    '.profile-item button[aria-label^="Delete"]',
  );
  await deleteButton.hover();
  await expect(deleteButton.locator(".icon")).toHaveCSS("transform", "none");
  await expect(deleteButton).toHaveCSS(
    "transform",
    "matrix(1.04, 0, 0, 1.04, 0, 0)",
  );
});

test("desktop navigation keeps its hover surface", async ({ page }) => {
  await page.goto("/me/devices");
  const link = page.locator('.sidebar nav a[href="/profiles"]');
  await link.hover();
  await expect(link).toHaveCSS("background-color", "rgba(255, 255, 255, 0.04)");
});

test("desktop row hover excludes switch and delete actions", async ({ page }) => {
  await page.goto("/profiles");
  const item = page.locator(".profile-item");
  const row = item.locator(".collection-row");
  const switchControl = row.locator('[role="switch"]');
  const rowBox = await row.boundingBox();
  expect(rowBox).not.toBeNull();

  await page.mouse.move(rowBox!.x + 20, rowBox!.y + rowBox!.height / 2);
  await expect(item).toHaveCSS("background-color", "rgb(28, 29, 30)");

  await switchControl.hover();
  await expect(item).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await page.mouse.move(rowBox!.x + 20, rowBox!.y + rowBox!.height / 2);
  await expect(item).toHaveCSS("background-color", "rgb(28, 29, 30)");

  const deleteButton = row.locator('button[aria-label^="Delete"]');
  await deleteButton.hover();
  await expect(item).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("desktop expanded details keep row hover outside row actions", async ({
  page,
}) => {
  await page.goto("/profiles");
  await page
    .getByRole("button", { name: "Show usage for profile@example.com" })
    .click();

  const item = page.locator(".profile-item");
  const row = item.locator(".collection-row");
  const details = page.locator(".profile-item .usage-content");
  await expect(details).toBeVisible();
  await page.mouse.move(0, 0);
  const restingColor = "rgba(0, 0, 0, 0)";
  await expect(item).toHaveCSS("background-color", restingColor);
  await row.hover();
  await expect(item).not.toHaveCSS("background-color", restingColor);
  await expect(row).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await details.hover();
  await expect(item).toHaveCSS("background-color", restingColor);
});

test("desktop usage reset widget keeps its hover surface and chevron motion", async ({
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
        }),
      });
    },
  );
  await page.goto("/profiles");
  await page
    .getByRole("button", { name: "Show usage for profile@example.com" })
    .click();

  const summary = page.getByRole("button", { name: /Usage limit resets/ });
  const badge = summary.locator(".available");
  await expect(badge).toHaveText("1 available");
  const summaryBox = await summary.boundingBox();
  expect(summaryBox).not.toBeNull();
  await page.mouse.move(summaryBox!.x + 20, summaryBox!.y + 20);
  const widget = page.locator(".reset-widget");
  await expect(widget).toHaveCSS("background-color", "rgb(41, 42, 43)");
  const chevron = summary.locator(".chevron");
  await expect(chevron).toHaveCSS(
    "transform",
    "matrix(1.06, 0, 0, 1.06, 0, 0)",
  );
  await expect(chevron).toHaveCSS("color", "rgb(237, 237, 237)");
});
