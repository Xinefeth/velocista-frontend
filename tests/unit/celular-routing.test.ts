// Rutas de la página del celular: /celular y /celular/ sirven celular.html (Render, dev y preview),
// y ya no existe la página vieja de public/celular.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { celularRewrite, celularUrl } from "../../vite.celular";

const root = resolve(__dirname, "../..");

describe("reescritura de /celular en Vite (dev y preview)", () => {
  it("manda /celular y /celular/ a celular.html, con o sin query", () => {
    expect(celularUrl("/celular")).toBe("/celular.html");
    expect(celularUrl("/celular/")).toBe("/celular.html");
    expect(celularUrl("/celular/?dev=cel-1")).toBe("/celular.html?dev=cel-1");
    expect(celularUrl("/celular?dev=cel-1")).toBe("/celular.html?dev=cel-1");
  });

  it("no toca la consola ni otras rutas", () => {
    expect(celularUrl("/")).toBe("/");
    expect(celularUrl("/celular.html")).toBe("/celular.html");
    expect(celularUrl("/celular.html?dev=x")).toBe("/celular.html?dev=x");
    expect(celularUrl("/celulares")).toBe("/celulares");
    expect(celularUrl("/celular/otra")).toBe("/celular/otra");
    expect(celularUrl("/api/celular/")).toBe("/api/celular/");
    expect(celularUrl(undefined)).toBeUndefined();
  });

  it("el plugin la aplica en el servidor de desarrollo y en el de preview", () => {
    const plugin = celularRewrite();
    for (const hook of ["configureServer", "configurePreviewServer"] as const) {
      let middleware: ((req: { url?: string }, res: unknown, next: () => void) => void) | undefined;
      const server = { middlewares: { use: (fn: typeof middleware) => (middleware = fn) } };
      (plugin[hook] as unknown as (s: unknown) => void)(server);
      const req = { url: "/celular/" };
      let called = false;
      middleware!(req, {}, () => (called = true));
      expect(req.url).toBe("/celular.html");
      expect(called).toBe(true);
    }
  });
});

describe("render.yaml", () => {
  const yaml = readFileSync(resolve(root, "render.yaml"), "utf8");
  const sources = [...yaml.matchAll(/source:\s*(\S+)/g)].map((m) => m[1]);

  it("tiene reglas explícitas para /celular/ y /celular, antes de /*", () => {
    expect(sources).toContain("/celular/");
    expect(sources).toContain("/celular");
    const last = sources.indexOf("/*");
    expect(last).toBeGreaterThan(sources.indexOf("/celular/"));
    expect(last).toBeGreaterThan(sources.indexOf("/celular"));
    expect(sources.indexOf("/celular/")).toBeLessThan(sources.indexOf("/celular"));
  });

  it("las dos reglas del celular apuntan a /celular.html", () => {
    for (const source of ["/celular/", "/celular"]) {
      const rule = new RegExp(`source:\\s*${source}\\s*\\r?\\n\\s*destination:\\s*(\\S+)`).exec(
        yaml,
      );
      expect(rule?.[1]).toBe("/celular.html");
    }
  });
});

describe("una sola página del celular", () => {
  it("ya no existe public/celular/index.html y sí celular.html", () => {
    expect(existsSync(resolve(root, "public/celular/index.html"))).toBe(false);
    expect(existsSync(resolve(root, "celular.html"))).toBe(true);
  });
});
