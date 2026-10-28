// Guarda automática de la paleta (EN-28, Requirement 20): la vista del Trazador solo usa los tokens de
// la consola y exactamente tres tokens propios `--track-*`. Falla ante colores literales, variables
// que solo existen en el prototipo, fuentes externas o variables CSS inexistentes.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_KEYS } from "@/domain/canvas";

const ROOT = process.cwd();
const TRACK_CSS = "src/ui/styles/track.css";
const PROTOTYPE_CSS = "src/ui/styles/prototype.css";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const rel = (p: string) => relative(ROOT, p).split("\\").join("/");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Archivos vigilados: componentes y página del Trazador, y su hoja de estilos. */
const WATCHED = [
  ...walk(join(ROOT, "src/ui/components/track")).map(rel),
  "src/ui/pages/TrackTracer.tsx",
  TRACK_CSS,
];

/** Lista blanca explícita: solo las tres declaraciones de tokens propios, una por línea. */
const WHITELIST = /^\s*--track-(paper|line|ink-on-paper):\s*#[0-9a-fA-F]{6};\s*$/;

const FORBIDDEN: [string, RegExp][] = [
  ["color hexadecimal", /#[0-9a-fA-F]{3,8}\b/],
  ["color rgb/rgba/hsl/hsla", /\b(?:rgb|rgba|hsl|hsla)\s*\(/i],
  ["variable solo del prototipo", /--(?:bg-2|bg-3|line-2|muted|gold|gold-soft|ok|ok-bg|bad|bad-bg|warn|warn-bg|desk|desk-dot|f-ui|f-num|f-cond|purple-ink|shadow)\b/],
  ["--dim (no llega a 4,5:1; no se usa para texto ni gráficos)", /--dim\b/],
  ["fuente externa", /IBM Plex|fonts\.googleapis|fonts\.gstatic/i],
  ["clase del prototipo que la consola no tiene (.btn, .pill, .pitem)", /className="[^"]*\b(?:btn|pill|pitem)\b/],
];

describe("paleta de la consola en el Trazador", () => {
  it("vigila los archivos esperados", () => {
    expect(WATCHED).toContain(TRACK_CSS);
    expect(WATCHED).toContain("src/ui/components/track/drawScene.ts");
    expect(WATCHED.filter((f) => f.endsWith(".tsx")).length).toBeGreaterThan(5);
  });

  it.each(FORBIDDEN)("ningún archivo contiene %s", (_name, pattern) => {
    const offenders: string[] = [];
    for (const file of WATCHED) {
      read(file)
        .split("\n")
        .forEach((line, i) => {
          if (file === TRACK_CSS && WHITELIST.test(line)) return;
          if (pattern.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("track.css declara exactamente tres tokens propios y ninguno choca con los de la consola", () => {
    const css = read(TRACK_CSS);
    const declared = [...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]);
    expect(declared.sort()).toEqual(["--track-ink-on-paper", "--track-line", "--track-paper"]);
    for (const trap of ["--purple", "--bg", "--line", "--ink", "--r"]) expect(declared).not.toContain(trap);
  });

  it("los tokens propios cumplen el contraste previsto", () => {
    const css = read(TRACK_CSS);
    const value = (name: string) => new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)![1];
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const v = parseInt(hex.slice(i, i + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const paper = value("--track-paper");
    expect(ratio(value("--track-ink-on-paper"), paper)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(value("--track-line"), paper)).toBeGreaterThanOrEqual(4.5);
  });

  it("todo var(--x) usado existe en prototype.css o track.css", () => {
    const known = new Set(
      [...(read(PROTOTYPE_CSS) + read(TRACK_CSS)).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
    );
    const unknown: string[] = [];
    for (const file of WATCHED) {
      for (const m of read(file).matchAll(/var\(\s*(--[a-z0-9-]+)/g))
        if (!known.has(m[1])) unknown.push(`${file}: ${m[1]}`);
    }
    expect(unknown).toEqual([]);
  });

  it("todas las claves de themeColors() están declaradas en las hojas de estilo", () => {
    const known = new Set(
      [...(read(PROTOTYPE_CSS) + read(TRACK_CSS)).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
    );
    expect(THEME_KEYS.filter((k) => !known.has(k))).toEqual([]);
  });

  it("los tokens --track-* se importan de forma eager desde main.tsx", () => {
    expect(read("src/main.tsx")).toContain('import "@/ui/styles/track.css";');
  });

  it("la guarda detecta una infracción (prueba de la propia prueba)", () => {
    const [, hex] = FORBIDDEN[0];
    const [, fn] = FORBIDDEN[1];
    expect(hex.test("color: #ff2d78;")).toBe(true);
    expect(fn.test("rgba(255, 45, 85, 0.4)")).toBe(true);
    expect(WHITELIST.test("  --track-paper: #fdfdfb;")).toBe(true);
    expect(WHITELIST.test("  --track-extra: #fdfdfb;")).toBe(false);
  });
});
