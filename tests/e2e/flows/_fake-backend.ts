import type { Page } from "@playwright/test";

/** Minimal in-memory backend that answers like the real API (English JSON fields). */
export async function fakeBackend(
  page: Page,
  options: { databaseUp?: boolean; withRobot?: boolean } = {},
) {
  const { withRobot = true } = options;
  const robots = withRobot
    ? [
        {
          id: "r1",
          name: "Velocista 001",
          short_code: "001",
          type: "racer",
          firmware: "0.3.1",
          current_version_id: 1,
          archived: false,
        },
      ]
    : [];
  const components: Record<string, unknown>[] = [];
  const created: Record<string, unknown>[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/health")
      return json({
        status: "ok",
        database: options.databaseUp === false ? "down" : "ok",
        environment: "e2e",
      });
    if (path === "/robots" && request.method() === "GET")
      return json({ items: robots, total: robots.length, limit: 200, offset: 0 });
    if (path === "/robots/r1/versions/1")
      return json({
        id: 1,
        robot_id: "r1",
        label: "v1",
        date: "2026-10-01T00:00:00Z",
        note: "Primer armado",
        status: "current",
        parts: {},
      });
    if (path === "/runs") return json({ items: [], total: 0, limit: 200, offset: 0 });
    if (path === "/components" && request.method() === "GET")
      return json({ items: components, total: components.length, limit: 200, offset: 0 });
    if (path === "/components" && request.method() === "POST") {
      const body = request.postDataJSON();
      created.push(body);
      const record = { id: `c${components.length + 1}`, archived: false, ...body };
      components.push(record);
      return json(record, 201);
    }
    return json({ detail: { reason: "not_found", detail: "No simulado" } }, 404);
  });
  return { created };
}
