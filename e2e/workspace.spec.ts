import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("research-only instruments remain visible on watchlist, asset detail and availability", async ({
  page,
}) => {
  await page.goto("/watchlist");
  const card = page
    .locator("main .watch-item")
    .filter({ has: page.getByRole("link", { name: "M6E", exact: true }) });
  await expect(card.getByText("No live price", { exact: true })).toBeVisible();
  await card.getByRole("link", { name: "M6E", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "M6E", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Research only · instrument details are unconfirmed.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Asset availability" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".availability-list")
      .getByText("Research only · no live price")
      .first(),
  ).toBeVisible();
});
test("archive search, revisions, watchlist and alert preferences survive reload", async ({
  page,
}) => {
  await page.goto("/research");
  await expect(
    page.getByRole("heading", { name: "Research", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search research").fill("earlier");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=earlier/);
  await page
    .getByRole("link", {
      name: "Earlier dollar thesis · preserved archive example",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Revision history" }),
  ).toBeVisible();
  await expect(
    page.getByText("Superseded", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to research" }).click();
  await expect(page.getByLabel("Search research")).toHaveValue("earlier");
  await page.goto("/watchlist");
  const first = page.locator("main .watch-item").first();
  const symbol = await first.locator(".watch-symbol").innerText();
  await first.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Dismissed", exact: true }).click();
  await expect(page.locator("main .watch-item .watch-symbol")).toContainText(
    symbol.trim().split("\n")[0],
  );
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nothing dismissed" }),
  ).toBeVisible();
  await page.goto("/alerts");
  await page
    .getByRole("button", { name: "Mark read", exact: true })
    .first()
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Mark unread", exact: true }),
  ).toHaveCount(1);
});
for (const width of [320, 390, 768, 1440])
  test(`responsive journeys and no document overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const route of [
      "/",
      "/research",
      "/watchlist",
      "/alerts",
      "/settings",
      "/assets/10000000-0000-4000-8000-000000000003",
      "/research/20000000-0000-4000-8000-000000000001",
    ]) {
      await page.goto(route);
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.locator(".skeleton")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    expect(errors).toEqual([]);
    await page.goto("/");
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: `docs/verification/overview-${width}.png`,
        fullPage: true,
      });
    if (width === 390)
      await expect(
        page.getByRole("navigation", { name: "Mobile navigation" }),
      ).toBeVisible();
  });
test("keyboard navigation, preferences and accessible overview", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.goto("/settings");
  await page.getByLabel("Display timezone").selectOption("Europe/London");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Display timezone")).toHaveValue(
    "Europe/London",
  );
});
test("synthetic labeling, exact identity and unknown instruments", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".demo-banner")).toContainText("synthetic");
  await expect(page.locator(".ticker")).toContainText("Demo");
  await page.goto("/assets/unknown");
  await expect(
    page.getByRole("heading", { name: "Instrument not mapped" }),
  ).toBeVisible();
  await page.goto("/assets/10000000-0000-4000-8000-000000000004");
  await expect(page.getByText("theme:gold", { exact: true })).toBeVisible();
  await expect(
    page.getByText("No live price", { exact: true }).last(),
  ).toBeVisible();
});
test("unconfigured production build fails closed without demo content", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5174");
  await expect(
    page.getByRole("heading", { name: "Connect your research workspace" }),
  ).toBeVisible();
  await expect(page.locator(".report-card")).toHaveCount(0);
});

test("offline notice and long unbroken headlines remain usable on narrow screens", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/research");
  await expect(page.locator(".report-card").first()).toBeVisible();
  await page
    .locator(".report-title h3")
    .first()
    .evaluate((el) => {
      el.textContent = "An unusually long headline " + "W".repeat(210);
    });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await context.setOffline(true);
  await expect(
    page.getByText("Offline · reconnect to retrieve the latest research."),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(page.locator(".offline-banner")).toHaveCount(0);
});
