import { expect, test } from "@playwright/test";
import { fakeBackend } from "./_fake-backend";

test.describe("console navigation", () => {
  test.beforeEach(async ({ page }) => {
    await fakeBackend(page);
    await page.addInitScript(() => localStorage.clear());
  });

  test("opens on the control page with the robot loaded from the API", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Salida" })).toBeVisible();
    await expect(page.getByText("Calibra los sensores antes de arrancar")).toBeVisible();
  });

  test("moves through the main sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Salida" })).toBeVisible();
    const sections: [string, RegExp][] = [
      ["Catálogo de componentes", /Componentes/],
      ["Armador de robots", /Robots/],
      ["Perfiles de reglamento", /Perfiles/],
    ];
    for (const [nav, expected] of sections) {
      await page.getByRole("button", { name: nav }).first().click();
      await expect(page.getByText(expected).first()).toBeVisible();
    }
  });
});
