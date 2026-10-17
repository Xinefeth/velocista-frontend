import { expect, test } from "@playwright/test";
import { fakeBackend } from "./_fake-backend";

test("a club without robots is guided to create the first one", async ({ page }) => {
  await fakeBackend(page, { withRobot: false });
  await page.goto("/");
  await expect(page.getByText("No hay robots registrados en el armador.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Crear primer robot" })).toBeVisible();
});
