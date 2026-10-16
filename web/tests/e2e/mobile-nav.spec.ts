import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const payload = path.endsWith("/sessions/current")
      ? { user_id: "user-1", username: "test@example.com", role: "administrator" }
      : path.endsWith("/devices")
        ? { meta: { type: "devices", href: "/devices", total: 0 }, items: [] }
        : path.endsWith("/profiles")
          ? {
              meta: { type: "profiles", href: "/profiles", total: 1 },
              items: [{
                meta: { type: "profile", href: "/profiles/profile-1" },
                profile_id: "profile-1",
                name: "profile@example.com",
                enabled: true,
                auth_status: "authorized",
                usage: null,
                usage_updated_at: null,
                plan_type: "free",
                plan_updated_at: null,
                subscription_expires_at: null,
                last_used_at: null,
              }],
            }
          : path.endsWith("/users")
            ? { meta: { type: "users", href: "/users", total: 0 }, items: [] }
            : {};
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
});

test("row hover owns the switch action context", async ({ page }) => {
  await page.goto("/profiles");
  const row = page.locator(".profile-row");
  const actions = row.locator(".actions");
  await actions.hover();
  await expect(row).toHaveCSS("background-color", "rgb(28, 29, 30)");
  const switchControl = row.locator('[role="switch"]');
  await expect(switchControl).toHaveCSS("background-color", "rgb(41, 42, 43)");
});

test("mobile navigation is a bottom bar with stable hit targets", async ({ page }) => {
  await page.goto("/me/devices");
  const sidebar = page.locator(".sidebar");
  await expect(sidebar).toBeVisible();
  const box = await sidebar.boundingBox();
  expect(box).not.toBeNull();
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  expect(box!.y + box!.height).toBeGreaterThanOrEqual(viewportHeight);
  expect(box!.y).toBeGreaterThan(viewportHeight - box!.height - 1);
  for (const link of await page.locator(".sidebar nav a").all()) {
    const linkBox = await link.boundingBox();
    expect(linkBox?.width).toBeGreaterThanOrEqual(44);
    expect(linkBox?.height).toBeGreaterThanOrEqual(44);
  }
});

test("sidebar navigation does not stack surface and icon transforms", async ({ page }) => {
  await page.goto("/me/devices");
  const link = page.locator('.sidebar nav a[href="/me/devices"]');
  await link.hover();
  const icon = link.locator("svg");
  await expect(icon).toHaveCSS("transform", "none");
  await expect(link).toHaveCSS("background-color", "rgb(41, 42, 43)");
});

test("row action spacing is symmetric and delete owns the press transform", async ({ page }) => {
  await page.goto("/profiles");
  const row = page.locator(".profile-row");
  const switchControl = row.locator('[role="switch"]');
  const divider = row.locator(".actions > i");
  const deleteButton = row.locator('button[aria-label^="Delete"]');
  const [switchBox, dividerBox, deleteBox] = await Promise.all([
    switchControl.boundingBox(),
    divider.boundingBox(),
    deleteButton.boundingBox(),
  ]);
  expect(switchBox).not.toBeNull();
  expect(dividerBox).not.toBeNull();
  expect(deleteBox).not.toBeNull();
  const leftGap = dividerBox!.x - (switchBox!.x + switchBox!.width);
  const rightGap = deleteBox!.x - (dividerBox!.x + dividerBox!.width);
  expect(leftGap).toBeGreaterThanOrEqual(rightGap + 3);

  await deleteButton.hover();
  await expect(deleteButton.locator(".icon")).toHaveCSS("transform", "none");
  await expect(deleteButton).toHaveCSS("transform", "matrix(1.04, 0, 0, 1.04, 0, 0)");
});
