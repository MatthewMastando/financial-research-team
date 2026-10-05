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
      "/trade-setups",
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

test("positioning is explicit, setup instructions are readable and personal plans work without quotes", async ({
  page,
}) => {
  await page.goto("/watchlist");
  const apple = page
    .locator("main .watch-item")
    .filter({ has: page.getByRole("link", { name: "AAPL", exact: true }) });
  await expect(apple.getByText("Long bias", { exact: true })).toBeVisible();
  await expect(
    apple.getByText("Wait for trigger", { exact: true }),
  ).toBeVisible();
  await apple
    .locator("summary")
    .filter({ hasText: "Trade setup instructions" })
    .click();
  await expect(apple.getByText("Entry trigger", { exact: true })).toBeVisible();
  await expect(
    apple.getByText("Sizing guidance", { exact: true }),
  ).toBeVisible();
  await expect(
    apple.getByText("Trade setup instructions", { exact: true }).last(),
  ).toBeVisible();
  const gold = page
    .locator("main .watch-item")
    .filter({ has: page.getByRole("link", { name: "Gold", exact: true }) });
  await expect(
    gold.getByText("Positioning not specified", { exact: true }),
  ).toBeVisible();
  const m6e = page
    .locator("main .watch-item")
    .filter({ has: page.getByRole("link", { name: "M6E", exact: true }) });
  await expect(m6e.getByText("Watch only", { exact: true })).toBeVisible();
  await expect(m6e.getByText("No live price", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "docs/verification/watchlist-positioning-1440.png",
    fullPage: true,
  });
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await m6e.getByRole("link", { name: "Add your trade plan" }).click();
  await page.getByRole("button", { name: "Create your plan" }).click();
  await page.getByLabel("Setup status").selectOption("ready");
  await page
    .getByRole("button", { name: "Save your plan", exact: true })
    .click();
  await expect(page.locator(".plan-form [role=alert]")).toContainText(
    "Ready setups require",
  );
  await page.getByLabel("Setup status").selectOption("conditional");
  await page
    .getByRole("combobox", { name: "Direction", exact: true })
    .selectOption("long");
  await page
    .getByLabel("Entry trigger", { exact: true })
    .fill("Confirm exact contract and retest");
  await page
    .getByRole("textbox", { name: "Trade setup instructions", exact: true })
    .fill(
      "My instructions: verify venue and expiry.\nWait for independent confirmation.",
    );
  await page
    .getByRole("button", { name: "Save your plan", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit your plan" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".personal-plan")).toContainText(
    "My instructions: verify venue and expiry.",
  );
  await expect(page.locator(".asset-intro .quote")).toContainText(
    "No live price",
  );
  await page.goto("/trade-setups");
  await expect(
    page.getByRole("heading", { name: "Trade setups", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".personal-plan")).toContainText(
    "My instructions: verify venue and expiry.",
  );
  await page.getByLabel("Setup direction").selectOption("long");
  await expect(page.locator("main .watch-symbol")).toContainText([
    "EUR/USD",
    "AAPL",
    "M6E",
  ]);
  await page.getByLabel("Setup direction").selectOption("short");
  await expect(page.locator("main .watch-symbol")).toHaveText(["BTC"]);
});

test("a stale personal-plan editor keeps its draft and cannot overwrite a newer save", async ({
  page,
  context,
}) => {
  const route = "/assets/10000000-0000-4000-8000-000000000005";
  await page.goto(route);
  await page.getByRole("button", { name: "Create your plan" }).click();
  await page
    .getByRole("textbox", { name: "Trade setup instructions", exact: true })
    .fill("Original plan");
  await page
    .getByRole("button", { name: "Save your plan", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit your plan" }).click();
  await page
    .getByRole("textbox", { name: "Trade setup instructions", exact: true })
    .fill("Stale unsaved draft");
  const second = await context.newPage();
  await second.goto(route);
  await second.getByRole("button", { name: "Edit your plan" }).click();
  await second
    .getByRole("textbox", { name: "Trade setup instructions", exact: true })
    .fill("Newer saved plan");
  await second
    .getByRole("button", { name: "Save your plan", exact: true })
    .click();
  await expect(second.locator(".personal-plan")).toContainText("Revision 2");
  // Returning to a visible page refetches current storage while retaining the draft's base revision.
  await page.bringToFront();
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page.locator(".plan-form")).toContainText(
    "Editing from revision 1",
  );
  await page
    .getByRole("button", { name: "Save your plan", exact: true })
    .click();
  await expect(page.locator(".plan-form [role=alert]")).toContainText(
    "A newer plan was saved",
  );
  await expect(
    page.getByRole("textbox", {
      name: "Trade setup instructions",
      exact: true,
    }),
  ).toHaveValue("Stale unsaved draft");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".personal-plan")).toContainText(
    "Newer saved plan",
  );
  await second.close();
});
