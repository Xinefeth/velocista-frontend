import { expect, test } from "@playwright/test";
import { fakeBackend } from "./_fake-backend";

test.describe("component registration (HU-02)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test("validation blocks an empty form with a Spanish message", async ({ page }) => {
    await fakeBackend(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Catálogo de componentes" }).click();
    await page.getByRole("button", { name: /Registrar/ }).click();
    await page.getByRole("button", { name: /Guardar/ }).click();
    await expect(page.getByText("Revisa los campos marcados antes de guardar.")).toBeVisible();
  });

  test("a valid component is sent to the API with English field names", async ({ page }) => {
    const backend = await fakeBackend(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Catálogo de componentes" }).click();
    await page.getByRole("button", { name: /Registrar/ }).click();
    await page.getByLabel("Nombre").fill("Sensor de prueba");
    await page.getByLabel("Precio (S/)").fill("25.5");
    await page.getByLabel("Masa (g)").fill("4");
    await page.getByRole("button", { name: /Guardar/ }).click();
    await expect.poll(() => backend.created.length).toBe(1);
    expect(backend.created[0]).toMatchObject({
      name: "Sensor de prueba",
      price: 25.5,
      mass_g: 4,
    });
  });
});
