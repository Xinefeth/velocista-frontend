// HU-10: el Armador desactiva en el navegador lo que prohíbe el perfil de reglamento, con su motivo,
// y los bloqueos siguen al perfil sin recargar la página. El backend es el falso de _fake-backend.
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fakeBackend } from "./_fake-backend";

const AMATEUR = "Muchik Rumble 4 · Amateur";
const CLUB = "Pruebas del club · Libre";
const EVIDENCE = "docs/evidencias/hu-10";

// Catálogo mínimo con la forma de la API: una turbina y dos motores de familias distintas.
const COMPONENTS = [
  {
    id: "t1",
    type_id: "turb",
    name: "Turbina EDF 30 mm",
    price: 60,
    mass_g: 25,
    store: "Lima",
    current_a: 3,
    specs: {},
    stock: 3,
    archived: false,
  },
  {
    id: "m1",
    type_id: "motor",
    name: "Motor TT amarillo",
    price: 12,
    mass_g: 30,
    store: "Lima",
    current_a: 0.2,
    specs: { familia: "TT amarillo" },
    stock: 9,
    archived: false,
  },
  {
    id: "m2",
    type_id: "motor",
    name: "Micromotor N20",
    price: 38,
    mass_g: 10,
    store: "Lima",
    current_a: 0.35,
    specs: { familia: "N20" },
    stock: 4,
    archived: false,
  },
];

async function openBuilder(page: Page) {
  await fakeBackend(page);
  // Las rutas registradas después tienen prioridad: este GET /components reemplaza al vacío
  await page.route("**/api/components*", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            items: COMPONENTS,
            total: COMPONENTS.length,
            limit: 200,
            offset: 0,
          }),
        })
      : route.fallback(),
  );
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("e2e-cleared")) {
      localStorage.clear();
      sessionStorage.setItem("e2e-cleared", "1");
    }
  });
  await page.goto("/");
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
}

const DESKTOP = { width: 1366, height: 900 };

// El riel de navegación se oculta bajo 980 px: se navega en escritorio y después se reduce la ventana
async function pickProfile(page: Page, name: string) {
  await page.setViewportSize(DESKTOP);
  await page.getByRole("button", { name: "Perfiles de reglamento" }).first().click();
  await page.getByRole("button", { name }).click();
  await page.getByRole("button", { name: "Armador de robots" }).first().click();
  await expect(page.getByRole("region", { name: "Armador" })).toBeVisible();
}

const select = (page: Page, name: string) => page.getByRole("combobox", { name, exact: true });
const notReloaded = (page: Page) =>
  page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload === true);

test.describe("HU-10 · bloqueos del reglamento en el Armador", () => {
  test("Amateur: turbina bloqueada con su motivo y el motor N20 desactivado", async ({ page }) => {
    await openBuilder(page);
    await pickProfile(page, AMATEUR);

    await expect(select(page, "Turbina")).toBeDisabled();
    await expect(page.getByText(`Turbina no permitida en ${AMATEUR}`)).toBeVisible();

    const motor = select(page, "Motores");
    await expect(motor.locator("option", { hasText: "Micromotor N20" })).toBeDisabled();
    await expect(motor.locator("option", { hasText: "Motor TT amarillo" })).toBeEnabled();
    await expect(page.getByText("No permitidos aquí").first()).toBeVisible();
    // el motivo está enlazado al control para lectores de pantalla
    await expect(motor).toHaveAttribute("aria-describedby", "blk-motor");
  });

  test("al cambiar a Club los bloqueos desaparecen sin recargar, y al volver reaparecen", async ({
    page,
  }) => {
    await openBuilder(page);
    await pickProfile(page, AMATEUR);
    await expect(select(page, "Turbina")).toBeDisabled();

    await pickProfile(page, CLUB);
    await expect(select(page, "Turbina")).toBeEnabled();
    await expect(page.getByText(`Turbina no permitida en ${AMATEUR}`)).toHaveCount(0);
    await expect(
      select(page, "Motores").locator("option", { hasText: "Micromotor N20" }),
    ).toBeEnabled();

    await pickProfile(page, AMATEUR);
    await expect(select(page, "Turbina")).toBeDisabled();
    expect(await notReloaded(page)).toBe(true);
  });

  test("a 360 px el Armador no tiene scroll horizontal con los bloqueos visibles", async ({
    page,
  }) => {
    await openBuilder(page);
    await pickProfile(page, AMATEUR);
    await page.setViewportSize({ width: 360, height: 800 });
    await expect(page.getByText(`Turbina no permitida en ${AMATEUR}`)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("capturas de evidencia: los cuatro perfiles, en escritorio y a 360 px", async ({ page }) => {
    mkdirSync(EVIDENCE, { recursive: true });
    const profiles: [string, string][] = [
      ["mr4a-amateur", AMATEUR],
      ["mr4s-senior", "Muchik Rumble 4 · Senior"],
      ["mr4m-master", "Muchik Rumble 4 · Master"],
      ["club-libre", CLUB],
    ];
    await openBuilder(page);
    for (const [size, viewport] of [
      ["escritorio", { width: 1366, height: 900 }],
      ["360px", { width: 360, height: 800 }],
    ] as const) {
      for (const [file, name] of profiles) {
        await pickProfile(page, name);
        await page.setViewportSize(viewport);
        await page.screenshot({ path: `${EVIDENCE}/armador-${file}-${size}.png`, fullPage: true });
      }
    }
  });
});
