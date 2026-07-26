/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-return, typescript/no-unsafe-type-assertion -- Page evaluation runs in Chrome's DOM context rather than the Worker TypeScript environment. */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createRequire } from "node:module";

import { bottles, captures, locations, sites } from "./catalogue-fixtures.ts";

const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

async function mockCatalogue(page: Page, bottleData = bottles): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "DELETE" || request.method() === "PATCH") {
      await route.fulfill({ body: "forced browser-test failure", status: 500 });
      return;
    }
    const data =
      path === "/api/bottles"
        ? bottleData
        : path === "/api/storage-locations"
          ? locations
          : path === "/api/sites"
            ? sites
            : path === "/api/bottle-captures"
              ? captures
              : [];
    await route.fulfill({
      body: JSON.stringify({ data }),
      contentType: "application/json",
      status: 200,
    });
  });
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(() =>
        [...document.querySelectorAll("dialog[open]")].every(
          (dialog) => getComputedStyle(dialog).opacity === "1",
        ),
      ),
    )
    .toBe(true);
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: () => Promise<{
            violations: readonly {
              id: string;
              nodes: readonly { failureSummary: string; target: readonly string[] }[];
            }[];
          }>;
        };
      }
    ).axe;
    return (await axe.run()).violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => ({
        failureSummary: node.failureSummary,
        target: node.target,
      })),
    }));
  });
  expect(violations).toEqual([]);
}

async function failDestructiveAction(
  page: Page,
  trigger: Locator,
  dialogName: string,
  actionName: string,
  failureMessage: string,
): Promise<void> {
  await trigger.focus();
  await trigger.press("Enter");
  const dialog = page.getByRole("alertdialog", { name: dialogName });
  const action = dialog.getByRole("button", { name: actionName });
  await action.focus();
  await action.press("Enter");
  await expect(dialog.getByRole("alert")).toContainText(failureMessage);
  await expect(dialog).toBeVisible();
  await expectNoAxeViolations(page);
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockCatalogue(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Browse bottles" })).toBeVisible();
});

test("persists navigation and filters while remaining accessible at reduced motion and reflow", async ({
  page,
}) => {
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
    true,
  );
  expect(
    await page.evaluate(() =>
      document
        .getAnimations()
        .every((animation) => Number(animation.effect?.getTiming().duration ?? 0) <= 1),
    ),
  ).toBe(true);
  await expectNoAxeViolations(page);

  await page.getByRole("textbox", { name: "Search bottles" }).fill("Shiraz");
  await expect(page).toHaveURL(/\?q=Shiraz/u);
  await page.getByRole("radio", { name: "Storage" }).click();
  await expect(page).toHaveURL(/grouping=storage/u);

  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByRole("heading", { name: "Photograph bottles" })).toBeVisible();
  await expect(page).toHaveURL(/area=captures/u);
  await expect(page.locator("[name='capturePosition']")).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole("button", { name: "Storage" }).click();
  await expect(page.getByRole("heading", { name: "Sites and locations" })).toBeVisible();
  await expectNoAxeViolations(page);
  const useForBottle = page.getByRole("button", { name: "Use for bottle" }).first();
  await useForBottle.focus();
  await useForBottle.press("Enter");
  await expect(page.getByRole("dialog", { name: "Add bottle" })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press("Escape");
  await expect(useForBottle).toBeFocused();

  await page.getByRole("button", { name: "Inventory" }).click();
  const addBottle = page.getByRole("button", { name: "Add bottle" });
  await addBottle.focus();
  await addBottle.press("Enter");
  await expect(page.getByRole("dialog", { name: "Add bottle" })).toBeVisible();
  expect(
    await page.evaluate(() =>
      document
        .getAnimations()
        .every((animation) => Number(animation.effect?.getTiming().duration ?? 0) <= 1),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(addBottle).toBeFocused();

  const editBottle = page.locator(".bottle-card").first().getByRole("button", { name: "Edit" });
  await editBottle.focus();
  await editBottle.press("Enter");
  await expect(page.getByRole("dialog", { name: "Edit bottle" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editBottle).toBeFocused();

  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByRole("textbox", { name: "Search bottles" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add bottle" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("keeps failed editor values and rejects malformed award numbers", async ({ page }) => {
  await page.locator(".bottle-card").first().getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit bottle" });
  await expectNoAxeViolations(page);
  const winery = dialog.getByRole("textbox", { name: /Winery/u });
  await winery.fill("Unsaved Browser Winery");
  await dialog.getByRole("button", { name: "Add review" }).click();
  await dialog.locator("[name='criticReviews.0.reviewSourceName']").fill("Browser critic");
  await dialog.locator("[name='criticReviews.0.ratingText']").fill("96 points");
  await dialog.getByRole("button", { name: "Add award" }).click();
  await dialog.locator("[name='awards.0.awardLevel']").fill("Gold");
  await dialog.locator("[name='awards.0.awardName']").fill("Browser show");
  await dialog.locator("[name='awards.0.points']").fill("0x10");
  await dialog.getByRole("button", { name: "Save bottle" }).click();
  await expect(dialog.getByText("Points must be a decimal number.")).toBeVisible();

  await dialog.locator("[name='awards.0.points']").fill("95");
  await dialog.getByRole("button", { name: "Save bottle" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Bottle was not updated.");
  await expect(winery).toHaveValue("Unsaved Browser Winery");
  await expect(dialog.locator("[name='criticReviews.0.ratingText']")).toHaveValue("96 points");
  await expect(dialog.locator("[name='awards.0.awardName']")).toHaveValue("Browser show");
});

test("keeps every destructive failure inside its active nested dialog", async ({ page }) => {
  const bottleCard = page.locator(".bottle-card").first();
  await bottleCard.getByRole("button", { name: "Edit" }).click();
  const bottleDialog = page.getByRole("dialog", { name: "Edit bottle" });
  await failDestructiveAction(
    page,
    bottleDialog.getByRole("button", { name: "Delete bottle" }),
    "Delete this bottle?",
    "Delete bottle",
    "Bottle was not deleted",
  );
  await bottleDialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Capture" }).click();
  await failDestructiveAction(
    page,
    page.getByRole("button", { name: "Delete capture" }),
    "Delete this capture?",
    "Delete capture",
    "Delete failed",
  );

  await page.getByRole("button", { name: "Storage" }).click();
  const locationsRegion = page.getByRole("region", { exact: true, name: "Locations" });
  await failDestructiveAction(
    page,
    locationsRegion.getByRole("button", { name: "Delete" }).first(),
    "Delete Left rack?",
    "Delete location",
    "Location was not deleted",
  );
  const sitesRegion = page.getByRole("region", { exact: true, name: "Sites" });
  await failDestructiveAction(
    page,
    sitesRegion.getByRole("button", { name: "Delete" }),
    "Delete Home cellar?",
    "Delete site",
    "Site was not deleted",
  );
});

test("keeps a representative large catalogue scrollable and focusable", async ({ page }) => {
  await page.unroute("**/api/**");
  const largeCatalogue = Array.from({ length: 160 }, (_, index) => ({
    ...bottles[0],
    displayName: `Scale bottle ${String(index).padStart(3, "0")}`,
    id: `scale-bottle-${index}`,
    wineVintageId: `scale-vintage-${index}`,
  }));
  await mockCatalogue(page, largeCatalogue);
  await page.reload();

  const cards = page.locator(".bottle-card");
  await expect(cards).toHaveCount(100);
  await expect(page.getByText("Showing 100 of 160 bottles")).toBeVisible();
  await page.getByRole("button", { name: "Show 60 more" }).click();
  await expect(cards).toHaveCount(160);
  const lastEdit = cards.last().getByRole("button", { name: "Edit" });
  await lastEdit.scrollIntoViewIfNeeded();
  await expect(lastEdit).toBeVisible();
  await lastEdit.focus();
  await expect(lastEdit).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
