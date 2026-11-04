// Armador con bloqueos del reglamento (HU-10, F2): ranuras y piezas prohibidas desactivadas con
// su motivo visible, tope de cantidad, pieza conservada y marcada, y cambio de perfil sin recargar.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Builder } from "@/ui/pages/Builder";
import { useConsole } from "@/application/state/ConsoleContext";
import { stubBrowser, WithConsole } from "./_harness";

beforeEach(stubBrowser);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Botones para cambiar de perfil igual que la vista de reglamentos (c.setProfile). */
function ProfileSwitch() {
  const c = useConsole();
  return (
    <div>
      {["mr4a", "mr4s", "mr4m", "club"].map((id) => (
        <button key={id} type="button" onClick={() => c.setProfile(id)}>
          perfil {id}
        </button>
      ))}
    </div>
  );
}

function open(profile: string, fresh = true) {
  render(
    <WithConsole>
      <ProfileSwitch />
      <Builder />
    </WithConsole>,
  );
  if (fresh) fireEvent.click(screen.getByRole("button", { name: "Nuevo robot" }));
  fireEvent.click(screen.getByRole("button", { name: `perfil ${profile}` }));
}

const select = (name: string) => screen.getByLabelText(name) as HTMLSelectElement;
const option = (sel: string, text: RegExp) =>
  within(select(sel)).getByRole("option", { name: text }) as HTMLOptionElement;
/** Elemento al que apunta aria-describedby del control. */
const described = (el: HTMLElement) => {
  const id = el.getAttribute("aria-describedby");
  expect(id, "aria-describedby").toBeTruthy();
  const target = document.getElementById(id!);
  expect(target, `#${id}`).toBeTruthy();
  return target!;
};

describe("ranuras enteras prohibidas por perfil", () => {
  const WHERE: Record<string, string> = {
    mr4a: "Muchik Rumble 4 · Amateur",
    mr4s: "Muchik Rumble 4 · Senior",
    mr4m: "Muchik Rumble 4 · Master",
    club: "Pruebas del club · Libre",
  };
  // [ranura, texto del motivo, perfiles donde está bloqueada]
  const SLOTS: [string, string, string[]][] = [
    ["Turbina", "Turbina no permitida en", ["mr4a", "mr4s"]],
    ["Encoders", "Encoders no permitidos en", ["mr4a", "mr4s", "mr4m"]],
    ["IMU", "IMU no permitida en", ["mr4a", "mr4s", "mr4m"]],
  ];
  for (const profile of Object.keys(WHERE))
    for (const [name, text, blockedIn] of SLOTS) {
      const blocked = blockedIn.includes(profile);
      it(`${profile}: ${name} ${blocked ? "desactivada con motivo" : "disponible"}`, () => {
        open(profile);
        expect(select(name).disabled).toBe(blocked);
        if (blocked) {
          const note = described(select(name));
          expect(note.textContent).toContain(`${text} ${WHERE[profile]}`);
          expect(note.querySelector("svg")).toBeTruthy(); // candado: no depende del color
        } else {
          expect(select(name).getAttribute("aria-describedby")).toBeNull();
        }
      });
    }
});

describe("piezas prohibidas dentro de una ranura", () => {
  it("mr4a: motores N20 y Micro Metal desactivados con motivo; el TT amarillo, no", () => {
    open("mr4a");
    expect(option("Motores", /N20/).disabled).toBe(true);
    expect(option("Motores", /N20/).textContent).toContain("no permitido");
    expect(option("Motores", /Micro Metal/).disabled).toBe(true);
    expect(option("Motores", /amarillo TT/).disabled).toBe(false);
    expect(option("Motores", /— Ninguno —/).disabled).toBe(false);
    const note = described(select("Motores"));
    expect(note.textContent).toContain("No permitidos aquí");
    expect(note.textContent).toContain(
      "Motor N20 no permitido en Muchik Rumble 4 · Amateur: solo TT amarillo",
    );
  });

  it("mr4a: la placa de expansión comercial queda desactivada con su motivo", () => {
    open("mr4a");
    expect(option("Placa de expansión", /Placa de expansión ESP32/).disabled).toBe(true);
    expect(described(select("Placa de expansión")).textContent).toContain(
      "Placa de expansión comercial no permitida en Muchik Rumble 4 · Amateur",
    );
  });

  it("mr4a: la lista de sensores respeta el máximo de 8 canales por la cantidad", () => {
    open("mr4a");
    expect(option("Sensores de línea", /QTR-8A/).disabled).toBe(false); // 8 × 1
    fireEvent.change(select("Sensores de línea"), { target: { value: "c05" } });
    // con un QTR-8A elegido ya no caben más módulos: «Más» desactivado con el motivo visible
    const more = screen.getAllByRole("button", { name: "Más" });
    const lineaMore = more.find((b) => b.closest(".slot")?.textContent?.includes("QTR-8A"))!;
    expect((lineaMore as HTMLButtonElement).disabled).toBe(true);
    expect(described(lineaMore).textContent).toContain(
      "Máximo 8 sensores en Muchik Rumble 4 · Amateur",
    );
  });

  it("mr4s: el motor y la placa se pueden elegir, solo cambia la turbina", () => {
    open("mr4s");
    expect(option("Motores", /N20/).disabled).toBe(false);
    expect(option("Placa de expansión", /Placa de expansión ESP32/).disabled).toBe(false);
    expect(select("Motores").getAttribute("aria-describedby")).toBeNull();
  });

  it("club: nada está desactivado en el Armador", () => {
    open("club");
    for (const sel of screen.getAllByRole("combobox")) {
      expect((sel as HTMLSelectElement).disabled).toBe(false);
      for (const o of within(sel).getAllByRole("option"))
        expect((o as HTMLOptionElement).disabled).toBe(false);
    }
    expect(document.querySelector(".blocknote")).toBeNull();
  });
});

describe("tope de cantidad de motores", () => {
  it("mr4a: «Más» se desactiva en 2 con el motivo visible", () => {
    open("mr4a");
    fireEvent.change(select("Motores"), { target: { value: "c11" } });
    const slot = select("Motores").closest(".slot") as HTMLElement;
    const more = within(slot).getByRole("button", { name: "Más" }) as HTMLButtonElement;
    expect(within(slot).getByText("2")).toBeTruthy();
    expect(more.disabled).toBe(true);
    expect(more.title).toBe("Máximo 2 motores en Muchik Rumble 4 · Amateur");
    expect(described(more).textContent).toContain("Máximo 2 motores en Muchik Rumble 4 · Amateur");
    fireEvent.click(within(slot).getByRole("button", { name: "Menos" }));
    expect(within(slot).getByText("1")).toBeTruthy();
    expect(more.disabled).toBe(false);
  });

  it("mr4m: sin tope, «Más» sigue activo hasta 4", () => {
    open("mr4m");
    fireEvent.change(select("Motores"), { target: { value: "c11" } });
    const slot = select("Motores").closest(".slot") as HTMLElement;
    const more = within(slot).getByRole("button", { name: "Más" }) as HTMLButtonElement;
    fireEvent.click(more);
    expect(within(slot).getByText("3")).toBeTruthy();
    expect(more.disabled).toBe(false);
  });
});

describe("pieza ya elegida que el perfil prohíbe", () => {
  // Velocista 001 (v1): placa comercial, 2 × QTR-8A (16 canales) y motores N20.
  const badChecks = () => [...document.querySelectorAll("li.bad b")].map((b) => b.textContent);
  const mark = (name: string) => select(name).closest(".slot") as HTMLElement;

  it("se conserva, la ranura se marca «no permitido» y el panel sigue en bad", () => {
    open("club", false);
    expect(select("Placa de expansión").value).toBe("c04");
    expect(document.querySelector(".slot.blocked")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "perfil mr4a" }));
    // nada se quitó solo
    expect(select("Placa de expansión").value).toBe("c04");
    expect(select("Motores").value).toBe("c09");
    expect(select("Sensores de línea").value).toBe("c05");
    // ranuras marcadas, con la palabra y el motivo
    for (const name of ["Placa de expansión", "Motores", "Sensores de línea"]) {
      expect(mark(name).classList.contains("blocked"), name).toBe(true);
      expect(mark(name).textContent).toContain("No permitido");
    }
    expect(mark("Placa de expansión").textContent).toContain(
      "Placa de expansión comercial no permitida en Muchik Rumble 4 · Amateur",
    );
    expect(mark("Microcontrolador").classList.contains("blocked")).toBe(false);
    // el panel de cumplimiento sigue marcando los errores
    for (const title of ["PCB comercial", "Tipo de motor", "Sensores"])
      expect(screen.getByText(title).closest("li")?.className, title).toBe("bad");
    // las demás piezas de la ranura siguen desactivadas; «— Ninguno —» no
    expect(option("Motores", /N20/).disabled).toBe(true);
    expect(option("Motores", /— Ninguno —/).disabled).toBe(false);
  });

  it("al cambiarla por una permitida, la marca desaparece sin recargar", () => {
    open("mr4a", false);
    expect(mark("Motores").classList.contains("blocked")).toBe(true);
    fireEvent.change(select("Motores"), { target: { value: "c11" } }); // TT amarillo
    expect(mark("Motores").classList.contains("blocked")).toBe(false);
    expect(mark("Motores").querySelector(".blk-mark")).toBeNull();
    // y «— Ninguno —» también la quita
    fireEvent.change(select("Placa de expansión"), { target: { value: "" } });
    expect(mark("Placa de expansión").classList.contains("blocked")).toBe(false);
  });

  it("una ranura entera prohibida con pieza elegida se conserva y se puede vaciar", () => {
    open("club", false);
    fireEvent.change(select("Turbina"), { target: { value: "" } });
    const turbina = within(select("Turbina")).getAllByRole("option")[1] as HTMLOptionElement;
    fireEvent.change(select("Turbina"), { target: { value: turbina.value } });
    fireEvent.click(screen.getByRole("button", { name: "perfil mr4a" }));
    expect(select("Turbina").value).toBe(turbina.value);
    expect(select("Turbina").disabled).toBe(false); // se puede quitar
    expect(mark("Turbina").classList.contains("blocked")).toBe(true);
    expect(mark("Turbina").textContent).toContain("Turbina no permitida en Muchik Rumble 4");
    expect(badChecks()).toContain("Turbina");
    fireEvent.change(select("Turbina"), { target: { value: "" } });
    expect(select("Turbina").disabled).toBe(true);
    expect(mark("Turbina").classList.contains("blocked")).toBe(false);
  });
});

describe("cambio de perfil sin recargar", () => {
  it("los bloqueos se recalculan en el mismo render: sin peticiones y sin remontar la vista", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    open("mr4a");
    const turbina = select("Turbina"); // el mismo nodo antes y después
    expect(turbina.disabled).toBe(true);
    expect(option("Motores", /N20/).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "perfil mr4m" }));
    expect(select("Turbina")).toBe(turbina);
    expect(turbina.disabled).toBe(false);
    expect(option("Motores", /N20/).disabled).toBe(false);
    expect(select("Encoders").disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "perfil club" }));
    expect(select("Encoders").disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "perfil mr4a" }));
    expect(turbina.disabled).toBe(true);
    expect(option("Motores", /N20/).disabled).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("estilos accesibles de los bloqueos", () => {
  const css = readFileSync(resolve(__dirname, "../../../src/ui/styles/prototype.css"), "utf8");
  const tokens = Object.fromEntries(
    [...css.matchAll(/^\s*--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gim)].map((m) => [m[1], m[2]]),
  );
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  // reglas CSS nuevas de HU-10
  const rules = [
    ...css.matchAll(/(\.slot[^{}]*blocknote[^{}]*|\.slot\.blocked[^{}]*)\{([^}]*)\}/g),
  ];

  it("hay reglas de bloqueo, sin --dim ni colores nuevos", () => {
    expect(rules.length).toBeGreaterThan(5);
    for (const [, sel, body] of rules) {
      expect(body, sel).not.toContain("--dim");
      expect(body, sel).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });

  it("el texto del motivo tiene contraste ≥ 4,5:1 sobre los fondos de la tarjeta", () => {
    for (const fg of ["mid", "ink", "red-hi"])
      for (const bg of ["panel", "panel2", "bg"])
        expect(contrast(tokens[fg], tokens[bg]), `${fg} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it("la nota ocupa toda la fila y rompe líneas largas (360 px sin scroll horizontal)", () => {
    const note = rules.find(([, sel]) => sel.trim() === ".slot .blocknote")!;
    expect(note[2]).toContain("grid-column: 1 / -1");
    expect(note[2]).toContain("min-width: 0");
    expect(note[2]).toContain("overflow-wrap: anywhere");
  });
});
