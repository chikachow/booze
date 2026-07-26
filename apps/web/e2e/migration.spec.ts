/* oxlint-disable typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-return, typescript/no-unsafe-type-assertion -- Page evaluation runs in Chrome's DOM context rather than the Worker TypeScript environment. */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createRequire } from "node:module";

import { bottles, captures, locations, sites } from "./catalogue-fixtures.ts";

const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

async function mockCatalogue(page: Page): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "DELETE" || request.method() === "PATCH") {
      await route.fulfill({ body: "forced browser-test failure", status: 500 });
      return;
    }
    const data =
      path === "/api/bottles"
        ? bottles
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
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: { run: () => Promise<{ violations: readonly { id: string }[] }> };
      }
    ).axe;
    return (await axe.run()).violations.map((violation) => violation.id);
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
  await trigger.click();
  const dialog = page.getByRole("alertdialog", { name: dialogName });
  await dialog.getByRole("button", { name: actionName }).click();
  await expect(dialog.getByRole("alert")).toContainText(failureMessage);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockCatalogue(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Browse bottles" })).toBeVisible();
});

test("persists navigation and filters while remaining accessible at reduced motion and zoom", async ({
  page,
}) => {
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
    true,
  );
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
  const useForBottle = page.getByRole("button", { name: "Use for bottle" }).first();
  await useForBottle.focus();
  await useForBottle.press("Enter");
  await expect(page.getByRole("dialog", { name: "Add bottle" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(useForBottle).toBeFocused();

  await page.evaluate(() => {
    document.documentElement.style.zoom = "200%";
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("keeps failed editor values and rejects malformed award numbers", async ({ page }) => {
  await page.locator(".bottle-card").first().getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit bottle" });
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
  await expect(page.getByText("Bottle was not updated.")).toBeVisible();
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
