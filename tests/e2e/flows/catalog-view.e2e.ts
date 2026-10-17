import { expect, test } from "@playwright/test";
import { fakeBackend } from "./_fake-backend";

test("operator opens the catalog and sees the empty list from the API", async ({ page }) => {
  await fakeBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Catálogo de componentes" }).first().click();
  await expect(page.getByRole("region", { name: "Catálogo" })).toBeVisible();
  await expect(page.getByLabel("Buscar componentes")).toBeVisible();
});
