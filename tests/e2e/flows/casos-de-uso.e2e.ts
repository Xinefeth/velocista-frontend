import { expect, test, type Page } from "@playwright/test";
import { fakeBackend } from "./_fake-backend";
import { fakeMeasurements } from "./_fake-measurements";

// EN-40: los 5 casos de uso del profesor (CU-1 a CU-5) de punta a punta en un navegador real,
// con el backend simulado. Cada caso guarda una captura como evidencia (test-results/).

test.beforeEach(async ({ page }) => {
  await fakeBackend(page);
  await fakeMeasurements(page);
  await page.addInitScript(() => localStorage.clear());
});

async function open(page: Page, section: string) {
  await page.goto("/");
  await page.getByRole("button", { name: section }).first().click();
}

async function evidence(page: Page, name: string) {
  await page.screenshot({ path: `test-results/evidencias/${name}.png`, fullPage: true });
}

test("CU-1 · medir un aula y compararla con su plano a escala 1:50", async ({ page }) => {
  await open(page, "Odometría · Medir terreno");
  const view = page.getByRole("region", { name: "Odometría · Medir terreno" });
  await view.getByLabel("Lugar o contorno").selectOption("escala");
  await view.getByLabel("Largo del dibujo").fill("16");
  await view.getByLabel("Ancho del dibujo").fill("12");
  await expect(view.getByLabel("Plano del lugar")).toContainText("28.0");
  await view.getByRole("button", { name: "Siguiente: calibrar" }).click();
  await expect(view.getByText("Sesgo 0.400 °/s")).toBeVisible();
  await view.getByRole("button", { name: /4\s*Resultado/ }).click();
  await view.getByRole("button", { name: "Abrir Aula 204 #3" }).click();
  await expect(view.getByLabel("Medidas del resultado")).toContainText("plano 28.0 m");
  await expect(view.getByText("Medición confiable").first()).toBeVisible();
  await evidence(page, "CU-1");
});

test("CU-1 · entrada inválida: «otro» lugar sin nombre no avanza", async ({ page }) => {
  await open(page, "Odometría · Medir terreno");
  const view = page.getByRole("region", { name: "Odometría · Medir terreno" });
  await view.getByLabel("Lugar o contorno").selectOption("otro");
  await view.getByRole("button", { name: "Siguiente: calibrar" }).click();
  await expect(view.getByRole("alert")).toContainText("nombre del lugar");
});

test("CU-2 · mapa de la pista medida frente a la diseñada", async ({ page }) => {
  await open(page, "Mapa de pista");
  const table = page.getByRole("table", { name: "Diseño frente a medido" });
  await expect(table).toContainText("Largo de la vuelta");
  await expect(table).toContainText("28.00 m");
  await expect(page.getByLabel("Pista diseñada", { exact: true })).toHaveValue("1");
  await evidence(page, "CU-2");
});

test("CU-3 · área de una figura cóncava marcando puntos", async ({ page }) => {
  await open(page, "Áreas y planos");
  const view = page.getByRole("region", { name: "Áreas y planos" });
  await view.getByRole("button", { name: "Rectángulo" }).click();
  await expect(view.getByLabel("Medidas de la figura")).toContainText("60.00");
  await view.getByRole("button", { name: "Acera en L" }).click();
  await expect(view.getByText("Figura cóncava: el área se calcula igual.")).toBeVisible();
  await view.getByLabel("x del punto").fill("2");
  await view.getByRole("button", { name: "Agregar punto" }).click();
  await expect(view.getByRole("alert")).toContainText("x e y");
  await evidence(page, "CU-3");
});

test("CU-4 · error del GPS y modelo que reajusta la precisión", async ({ page }) => {
  await open(page, "Precisión del GPS");
  const view = page.getByRole("region", { name: "Precisión del GPS" });
  await expect(view.getByText("Cancha 1 #1").or(view.getByText(/Cancha #1/))).toBeVisible();
  await expect(view.getByText("No, el lugar es chico para el GPS")).toBeVisible();
  await view.getByLabel("Lado más corto del lugar a medir").fill("40");
  await expect(view.getByText("Sí, el GPS sirve en este lugar")).toBeVisible();
  await view.getByRole("button", { name: "Evaluar modelo" }).click();
  await expect(view.getByText("El modelo baja el error y llega a verde")).toBeVisible();
  await expect(view.getByRole("table", { name: "Error antes y después del modelo" })).toContainText(
    "Validación",
  );
  await evidence(page, "CU-4");
});

test("CU-5 · plano desde lados y ángulos con lo que falta calculado", async ({ page }) => {
  await open(page, "Áreas y planos");
  const view = page.getByRole("region", { name: "Áreas y planos" });
  await view.getByRole("button", { name: "Lados y ángulos" }).click();
  await view.getByRole("button", { name: "Calcular plano" }).click();
  await expect(view.getByRole("table", { name: "Lados y ángulos de la figura" })).toContainText(
    "calculado",
  );
  await view.getByLabel("Largo del plano").fill("8");
  await view.getByLabel("Ancho del plano").fill("6");
  await expect(view.getByRole("table", { name: "Plano frente a figura" })).toContainText("0.0 %");
  await evidence(page, "CU-5");
});

test("CU-5 · entrada inválida: demasiados datos vacíos", async ({ page }) => {
  await open(page, "Áreas y planos");
  const view = page.getByRole("region", { name: "Áreas y planos" });
  await view.getByRole("button", { name: "Lados y ángulos" }).click();
  for (const i of [1, 2]) await view.getByLabel(`Lado ${i}`).fill("");
  await view.getByRole("button", { name: "Calcular plano" }).click();
  await expect(view.getByRole("alert")).toContainText("Faltan demasiados datos");
});

test("página del celular: abre, muestra el código y pide sensores antes de medir", async ({
  page,
}) => {
  await page.goto("/celular.html?dev=cel-621b8d99-e2e");
  await expect(page.getByRole("heading", { name: "Medición · Celular" })).toBeVisible();
  await expect(page.getByLabel("Código de este celular")).toHaveText("621b8d99");
  await page.getByRole("button", { name: "3. Medir" }).click();
  await expect(page.getByRole("table", { name: "Mis mediciones" })).toContainText("Aula 204 #3");
  await page.getByLabel("Nombre del lugar").fill("Mi cuarto");
  await page.getByRole("button", { name: "Iniciar medición" }).click();
  await expect(page.getByRole("alert")).toContainText("Activa los sensores");
  await page.getByRole("button", { name: "5. Modelo" }).click();
  await expect(page.getByLabel("Usar Aula 204 #3")).toBeChecked();
  await evidence(page, "celular");
});
