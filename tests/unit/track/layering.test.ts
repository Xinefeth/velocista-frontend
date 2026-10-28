// Guardas de arquitectura del Trazador (EN-28, Requirement 16): el código nuevo no ahonda la deuda
// conocida (domain → infrastructure, ui → @/infrastructure).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
const rel = (p: string) => relative(ROOT, p).split("\\").join("/");
const importsOf = (file: string) =>
  [...readFileSync(join(ROOT, file), "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);

const DOMAIN = walk(join(ROOT, "src/domain/track")).map(rel);
const UI = [...walk(join(ROOT, "src/ui/components/track")).map(rel), "src/ui/pages/TrackTracer.tsx"];
const APPLICATION = [
  "src/application/hooks/useTracks.ts",
  "src/application/hooks/useTrackProfiles.ts",
  "src/application/hooks/useTrackExport.ts",
  "src/application/state/TrackEditorProvider.tsx",
];
const INFRASTRUCTURE = [
  "src/infrastructure/http/tracks.ts",
  "src/infrastructure/http/profiles.ts",
  "src/infrastructure/http/trackErrors.ts",
  "src/infrastructure/contracts/tracks.ts",
  "src/infrastructure/download/saveBlob.ts",
];

describe("capas del Trazador", () => {
  it("domain/track solo importa de domain/track (sin infraestructura, aplicación, UI ni compartido)", () => {
    expect(DOMAIN.length).toBeGreaterThan(8);
    for (const file of DOMAIN)
      for (const imported of importsOf(file))
        expect(imported.startsWith("@/domain/track/"), `${file} importa ${imported}`).toBe(true);
  });

  it("domain/track no toca el navegador ni la red", () => {
    for (const file of DOMAIN) {
      const code = readFileSync(join(ROOT, file), "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
        .join("\n");
      expect(code, file).not.toMatch(/\b(?:window|document|localStorage|sessionStorage|fetch|WebSocket)\b/);
    }
  });

  it("la UI del Trazador no importa de @/infrastructure", () => {
    for (const file of UI)
      for (const imported of importsOf(file))
        expect(imported.startsWith("@/infrastructure"), `${file} importa ${imported}`).toBe(false);
  });

  it("la infraestructura nueva no importa de application ni de ui", () => {
    for (const file of INFRASTRUCTURE)
      for (const imported of importsOf(file))
        expect(/^@\/(application|ui)\//.test(imported), `${file} importa ${imported}`).toBe(false);
  });

  it("la aplicación nueva no importa de ui", () => {
    for (const file of APPLICATION)
      for (const imported of importsOf(file)) expect(imported.startsWith("@/ui"), `${file} importa ${imported}`).toBe(false);
  });

  it("solo la capa de infraestructura llama a fetch (el trazador usa request())", () => {
    for (const file of [...UI, ...APPLICATION, ...DOMAIN])
      expect(readFileSync(join(ROOT, file), "utf8"), file).not.toMatch(/\bfetch\s*\(/);
  });
});
