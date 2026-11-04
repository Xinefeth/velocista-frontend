// Barra superior y Control con el perfil de reglamento activo (HU-10, F3): nombre accesible del
// chip con perfil y cumplimiento, marca que no depende del color y motivo de la velocidad por mapa.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Strip } from "@/ui/components/Strip";
import { Control } from "@/ui/pages/Control";
import { useConsole } from "@/application/state/ConsoleContext";
import { complies } from "@/domain/rules";
import { regChipLabel, speedMapBlock, SPEED_MAP_PENDING } from "@/domain/profileStatus";
import { PERFILES } from "@/shared/data/rulebook";
import { ROBOTS } from "@/shared/data/robots";
import { stubBrowser, WithConsole } from "../pages/_harness";

beforeEach(stubBrowser);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Cambia de perfil como la vista de reglamentos y muestra la pestaña y la conformidad actuales. */
function Probe() {
  const c = useConsole();
  return (
    <div>
      {PERFILES.map((p) => (
        <button key={p.id} type="button" onClick={() => c.setProfile(p.id)}>
          perfil {p.id}
        </button>
      ))}
      <output aria-label="pestaña">{c.tab}</output>
      <output aria-label="cumple">{String(complies(c.robot, c.profile, c.catalog))}</output>
    </div>
  );
}

const chip = () => screen.getByRole("button", { name: /^Perfil de reglamento/ });
const pick = (id: string) => fireEvent.click(screen.getByRole("button", { name: `perfil ${id}` }));

describe("chip del perfil en la barra superior", () => {
  const open = () =>
    render(
      <WithConsole>
        <Probe />
        <Strip />
      </WithConsole>,
    );

  it("su nombre accesible dice el perfil y si el robot cumple, para cada perfil", () => {
    open();
    for (const p of PERFILES) {
      pick(p.id);
      const ok = screen.getByLabelText("cumple").textContent === "true";
      const name = chip().getAttribute("aria-label")!;
      expect(name).toContain(`${p.comp} · ${p.cat}`);
      expect(name).toContain(ok ? " cumple el reglamento" : " no cumple el reglamento");
      expect(name).toBe(regChipLabel(p, ROBOTS[0].name, ok));
    }
  });

  it("muestra la marca ✓ o ✕ además del color, y la clase ok/bad coincide", () => {
    open();
    const seen = new Set<string>();
    for (const p of PERFILES) {
      pick(p.id);
      const ok = screen.getByLabelText("cumple").textContent === "true";
      const mark = chip().querySelector(".regstate")!;
      expect(mark.textContent).toBe(ok ? "✓" : "✕");
      expect(chip().classList.contains(ok ? "ok" : "bad")).toBe(true);
      expect(chip().textContent).toContain(`${p.tag} · ${p.cat}`);
      seen.add(mark.textContent!);
    }
    expect(seen.size).toBe(2); // con los 4 perfiles se ven ambos estados
  });

  it("se actualiza sin recargar: el mismo botón cambia de perfil", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    open();
    pick("mr4a");
    const node = chip();
    expect(node.textContent).toContain("MR4 · Amateur");
    pick("club");
    expect(chip()).toBe(node);
    expect(node.textContent).toContain("Club · Libre");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("es un botón alcanzable con teclado que abre Perfiles de reglamento", () => {
    open();
    const node = chip();
    expect(node.tagName).toBe("BUTTON");
    expect(node.tabIndex).toBeGreaterThanOrEqual(0);
    node.focus();
    expect(document.activeElement).toBe(node);
    fireEvent.click(node); // Enter y Espacio sobre un botón disparan click
    expect(screen.getByLabelText("pestaña").textContent).toBe("rules");
  });
});

describe("motivo de la velocidad por mapa en Control", () => {
  const open = () =>
    render(
      <WithConsole>
        <Probe />
        <Control />
      </WithConsole>,
    );
  const sw = () => screen.getByRole("switch", { name: "Velocidad por mapa" }) as HTMLButtonElement;

  it("dominio: bloqueada salvo en el perfil libre, con el formato común", () => {
    for (const p of PERFILES) {
      const b = speedMapBlock(p);
      expect(b.blocked).toBe(!p.rules.speedMap);
      if (b.blocked) {
        expect(b.reason).toMatch(
          new RegExp(`^Velocidad por mapa no permitida en ${p.comp} · ${p.cat}: `),
        );
      } else expect(b.reason).toBe("");
    }
  });

  it("perfil restringido: interruptor desactivado y motivo enlazado y visible", () => {
    open();
    pick("mr4a");
    expect(sw().disabled).toBe(true);
    const why = document.getElementById(sw().getAttribute("aria-describedby")!)!;
    expect(why.textContent).toBe(speedMapBlock(PERFILES.find((p) => p.id === "mr4a")!).reason);
    expect(why.textContent).toContain(
      "Velocidad por mapa no permitida en Muchik Rumble 4 · Amateur",
    );
    expect(why.closest(".lockrow")!.querySelector("svg")).toBeTruthy(); // candado
  });

  it("al cambiar de perfil el motivo se actualiza sin recargar", () => {
    open();
    pick("mr4a");
    const why = () => document.getElementById("speedmap-why")!;
    const node = why();
    pick("mr4m");
    expect(why().textContent).toContain("Muchik Rumble 4 · Master");
    pick("club");
    expect(why()).toBe(node);
    expect(why().textContent).toBe(SPEED_MAP_PENDING);
    expect(sw().disabled).toBe(true); // sigue fuera del curso
  });
});
