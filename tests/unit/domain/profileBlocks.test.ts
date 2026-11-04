// Bloqueos del reglamento (HU-10, F1): cada regla × los 4 perfiles, datos ausentes y coherencia
// con checks(). Paridad de las claves de la tabla con la semilla del backend (fixture copiado).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { itemBlock, profileLabel, qtyLimit, slotBlock } from "@/domain/profileBlocks";
import { checks, facts } from "@/domain/rules";
import type { Component, Parts, Profile, Slot } from "@/domain/models/domain";
import { CAT, RANURAS } from "@/shared/data/catalog";
import { PERFILES } from "@/shared/data/rulebook";

const slot = (key: string): Slot => RANURAS.find((s) => s.key === key)!;
const profile = (id: string): Profile => PERFILES.find((p) => p.id === id)!;
const named = (name: string): Component => CAT.find((c) => c.name.includes(name))!;
const item = (
  typeId: string,
  specs: Record<string, string | number>,
  name = "Ítem",
): Component => ({
  id: "x",
  typeId,
  name,
  price: 1,
  mass: 1,
  store: "t",
  stock: 1,
  specs,
});
const IDS = ["mr4a", "mr4s", "mr4m", "club"] as const;

describe("slotBlock: ranuras enteras prohibidas", () => {
  // turbina / encoders / IMU permitidos por perfil
  const allowed: Record<string, Record<string, boolean>> = {
    turb: { mr4a: false, mr4s: false, mr4m: true, club: true },
    enc: { mr4a: false, mr4s: false, mr4m: false, club: true },
    imu: { mr4a: false, mr4s: false, mr4m: false, club: true },
  };
  for (const key of Object.keys(allowed))
    for (const id of IDS)
      it(`${key} en ${id}: ${allowed[key][id] ? "libre" : "bloqueada"}`, () => {
        const b = slotBlock(profile(id), slot(key));
        expect(b.blocked).toBe(!allowed[key][id]);
        if (b.blocked) {
          expect(b.reason).toContain(profileLabel(profile(id)));
          expect(b.reason).toMatch(/no permitid[ao]s? en /);
        } else expect(b.reason).toBe("");
      });

  it("las demás ranuras nunca se bloquean enteras", () => {
    for (const s of RANURAS.filter((x) => !(x.key in allowed)))
      for (const id of IDS) expect(slotBlock(profile(id), s).blocked).toBe(false);
  });

  it("el motivo sigue el formato «{Opción} no permitida en {competición} · {categoría}»", () => {
    expect(slotBlock(profile("mr4a"), slot("turb")).reason).toBe(
      "Turbina no permitida en Muchik Rumble 4 · Amateur",
    );
  });
});

describe("itemBlock por regla", () => {
  it("commercialPcb=false bloquea las placas comerciales (solo mr4a)", () => {
    const exp = named("Placa de expansión");
    expect(exp.specs.comercial).toBe("Sí");
    expect(itemBlock(profile("mr4a"), slot("exp"), exp).blocked).toBe(true);
    for (const id of ["mr4s", "mr4m", "club"])
      expect(itemBlock(profile(id), slot("exp"), exp).blocked).toBe(false);
    expect(itemBlock(profile("mr4a"), slot("exp"), item("exp", { comercial: "No" })).blocked).toBe(
      false,
    );
  });

  it("motorFam limita la familia (solo mr4a: TT amarillo)", () => {
    for (const [name, okInA] of [
      ["TT", true],
      ["N20", false],
      ["Micro Metal", false],
    ] as const) {
      const m = CAT.find((c) => c.typeId === "motor" && String(c.specs.familia).includes(name))!;
      expect(m, name).toBeTruthy();
      expect(itemBlock(profile("mr4a"), slot("motor"), m).blocked).toBe(!okInA);
      for (const id of ["mr4s", "mr4m", "club"])
        expect(itemBlock(profile(id), slot("motor"), m).blocked).toBe(false);
    }
    const n20 = CAT.find((c) => c.specs.familia === "N20")!;
    expect(itemBlock(profile("mr4a"), slot("motor"), n20).reason).toBe(
      "Motor N20 no permitido en Muchik Rumble 4 · Amateur: solo TT amarillo",
    );
  });

  it("mcu limita por nombre con el criterio de checks() (solo mr4a)", () => {
    const mcus = CAT.filter((c) => c.typeId === "mcu");
    expect(mcus.length).toBeGreaterThan(0);
    for (const m of mcus) {
      // ESP32, Nano y Pico están en la lista de mr4a
      expect(itemBlock(profile("mr4a"), slot("mcu"), m).blocked).toBe(false);
      for (const id of ["mr4s", "mr4m", "club"])
        expect(itemBlock(profile(id), slot("mcu"), m).blocked).toBe(false);
    }
    const stm = item("mcu", {}, "STM32 Blue Pill");
    expect(itemBlock(profile("mr4a"), slot("mcu"), stm).blocked).toBe(true);
    expect(itemBlock(profile("mr4a"), slot("mcu"), stm).reason).toContain("Arduino UNO");
    for (const id of ["mr4s", "mr4m", "club"])
      expect(itemBlock(profile(id), slot("mcu"), stm).blocked).toBe(false);
    expect(itemBlock(profile("mr4a"), slot("mcu"), item("mcu", {}, "Arduino UNO R3")).blocked).toBe(
      false,
    );
  });

  it("chasisMat limita el material (solo mr4a: 3D o MDF)", () => {
    const aluminum = item("chasis", { material: "Aluminio", ancho: 100, largo: 100 });
    const mdf = item("chasis", { material: "MDF", ancho: 100, largo: 100 });
    const printed = item("chasis", { material: "PETG impreso 3D", ancho: 100, largo: 100 });
    expect(itemBlock(profile("mr4a"), slot("chasis"), aluminum).blocked).toBe(true);
    expect(itemBlock(profile("mr4a"), slot("chasis"), mdf).blocked).toBe(false);
    expect(itemBlock(profile("mr4a"), slot("chasis"), printed).blocked).toBe(false);
    for (const id of ["mr4s", "mr4m", "club"])
      expect(itemBlock(profile(id), slot("chasis"), aluminum).blocked).toBe(false);
  });

  it("dim limita ancho × largo (mr4a/mr4s 200×250, mr4m 300×300, club libre)", () => {
    const big = item("chasis", { material: "MDF", ancho: 250, largo: 280 });
    const wide = item("chasis", { material: "MDF", ancho: 210, largo: 200 });
    const exact = item("chasis", { material: "MDF", ancho: 200, largo: 250 });
    const huge = item("chasis", { material: "MDF", ancho: 301, largo: 100 });
    expect(itemBlock(profile("mr4a"), slot("chasis"), big).blocked).toBe(true);
    expect(itemBlock(profile("mr4a"), slot("chasis"), exact).blocked).toBe(false);
    expect(itemBlock(profile("mr4s"), slot("chasis"), wide).blocked).toBe(true);
    expect(itemBlock(profile("mr4s"), slot("chasis"), exact).blocked).toBe(false);
    expect(itemBlock(profile("mr4m"), slot("chasis"), big).blocked).toBe(false);
    expect(itemBlock(profile("mr4m"), slot("chasis"), huge).blocked).toBe(true);
    expect(itemBlock(profile("club"), slot("chasis"), huge).blocked).toBe(false);
    expect(itemBlock(profile("mr4s"), slot("chasis"), big).reason).toBe(
      "Chasis de 250 × 280 mm no permitido en Muchik Rumble 4 · Senior: máximo 200 × 250 mm",
    );
  });

  it("maxSensors limita canales × cantidad (solo mr4a: 8)", () => {
    const eight = named("QTR-8A"),
      five = named("TCRT5000");
    expect(itemBlock(profile("mr4a"), slot("linea"), eight, 1).blocked).toBe(false);
    expect(itemBlock(profile("mr4a"), slot("linea"), eight, 2).blocked).toBe(true);
    expect(itemBlock(profile("mr4a"), slot("linea"), five, 1).blocked).toBe(false);
    expect(itemBlock(profile("mr4a"), slot("linea"), five, 2).blocked).toBe(true);
    expect(itemBlock(profile("mr4a"), slot("linea"), five, 2).reason).toBe(
      "10 sensores no permitidos en Muchik Rumble 4 · Amateur: máximo 8",
    );
    for (const id of ["mr4s", "mr4m", "club"])
      expect(itemBlock(profile(id), slot("linea"), eight, 4).blocked).toBe(false);
  });

  it("las ranuras sin regla de ítem nunca bloquean", () => {
    const withRule = ["exp", "motor", "mcu", "chasis", "linea"];
    for (const s of RANURAS.filter((x) => !withRule.includes(x.key)))
      for (const c of CAT.filter((x) => x.typeId === s.typeId))
        for (const id of IDS) expect(itemBlock(profile(id), s, c).blocked).toBe(false);
  });
});

describe("qtyLimit", () => {
  it("motores: tope rules.motors (mr4a y mr4s 2; mr4m y club sin tope)", () => {
    expect(qtyLimit(profile("mr4a"), slot("motor"))).toEqual({
      max: 2,
      reason: "Máximo 2 motores en Muchik Rumble 4 · Amateur",
    });
    expect(qtyLimit(profile("mr4s"), slot("motor"))?.max).toBe(2);
    expect(qtyLimit(profile("mr4m"), slot("motor"))).toBeNull();
    expect(qtyLimit(profile("club"), slot("motor"))).toBeNull();
  });

  it("sensores de línea: cuántos módulos caben en maxSensors (solo mr4a)", () => {
    expect(qtyLimit(profile("mr4a"), slot("linea"), named("QTR-8A"))?.max).toBe(1);
    expect(qtyLimit(profile("mr4a"), slot("linea"), item("linea", { canales: 4 }))?.max).toBe(2);
    expect(qtyLimit(profile("mr4a"), slot("linea"))).toBeNull(); // sin ítem no hay cálculo
    expect(qtyLimit(profile("mr4s"), slot("linea"), named("QTR-8A"))).toBeNull();
  });

  it("otras ranuras no tienen tope", () => {
    for (const s of RANURAS.filter((x) => !["motor", "linea"].includes(x.key)))
      for (const id of IDS) expect(qtyLimit(profile(id), s)).toBeNull();
  });
});

describe("datos ausentes: no se bloquea", () => {
  const strict = profile("mr4a");
  it("ítems sin la especificación que evalúa la regla", () => {
    expect(itemBlock(strict, slot("exp"), item("exp", {}))).toEqual({ blocked: false, reason: "" });
    expect(itemBlock(strict, slot("motor"), item("motor", {})).blocked).toBe(false);
    expect(itemBlock(strict, slot("chasis"), item("chasis", {})).blocked).toBe(false);
    expect(itemBlock(strict, slot("chasis"), item("chasis", { ancho: 100 })).blocked).toBe(false);
    expect(
      itemBlock(strict, slot("chasis"), item("chasis", { ancho: "n/d", largo: 9 })).blocked,
    ).toBe(false);
    expect(itemBlock(strict, slot("linea"), item("linea", {})).blocked).toBe(false);
    expect(qtyLimit(strict, slot("linea"), item("linea", {}))).toBeNull();
  });
});

describe("coherencia con checks()", () => {
  const bad = (p: Profile, parts: Parts) =>
    checks(facts(parts, CAT), p)
      .filter((c) => c[0] === "bad")
      .map((c) => c[1]);

  it("un ítem bloqueado que se elige hace que algún chequeo salga «bad»", () => {
    let blocked = 0;
    for (const p of PERFILES)
      for (const s of RANURAS)
        for (const c of CAT.filter((x) => x.typeId === s.typeId))
          for (const qty of s.qty ? [1, 2, 3, 4] : [1]) {
            const parts: Parts = { [s.key]: { id: c.id, qty } };
            const b = slotBlock(p, s).blocked || itemBlock(p, s, c, qty).blocked;
            if (!b) continue;
            blocked++;
            expect(bad(p, parts).length, `${p.id}/${s.key}/${c.name}×${qty}`).toBeGreaterThan(0);
          }
    expect(blocked).toBeGreaterThan(10);
  });

  it("un ítem permitido no dispara el chequeo de su propia regla", () => {
    const ruleOf: Record<string, string[]> = {
      exp: ["PCB comercial"],
      motor: ["Tipo de motor"],
      mcu: ["Microcontrolador"],
      chasis: ["Chasis", "Dimensiones"],
      linea: ["Sensores"],
      turb: ["Turbina"],
      enc: ["Encoders"],
      imu: ["IMU"],
    };
    for (const p of PERFILES)
      for (const s of RANURAS.filter((x) => ruleOf[x.key]))
        for (const c of CAT.filter((x) => x.typeId === s.typeId)) {
          if (slotBlock(p, s).blocked || itemBlock(p, s, c, 1).blocked) continue;
          const fails = bad(p, { [s.key]: { id: c.id, qty: 1 } });
          expect(
            fails.filter((t) => ruleOf[s.key].includes(t)),
            `${p.id}/${s.key}/${c.name}`,
          ).toEqual([]);
        }
  });

  it("superar el tope de motores hace que checks() marque «Motores» en bad", () => {
    const motor = named("TT");
    for (const p of PERFILES) {
      const lim = qtyLimit(p, slot("motor"));
      if (!lim) continue;
      expect(bad(p, { motor: { id: motor.id, qty: lim.max } })).not.toContain("Motores");
      expect(bad(p, { motor: { id: motor.id, qty: lim.max + 1 } })).toContain("Motores");
    }
  });

  it("el tope de módulos de línea coincide con el límite de sensores de checks()", () => {
    const p = profile("mr4a"),
      c = item("linea", { canales: 4 });
    const lim = qtyLimit(p, slot("linea"), c)!;
    const f = (qty: number) => ({ ...facts({}, CAT), sensors: 4 * qty });
    expect(checks(f(lim.max), p).filter((x) => x[0] === "bad" && x[1] === "Sensores")).toEqual([]);
    expect(checks(f(lim.max + 1), p).some((x) => x[0] === "bad" && x[1] === "Sensores")).toBe(true);
  });
});

describe("paridad con la semilla del backend (0003_reference_data.json)", () => {
  type Seed = {
    id: string;
    competition: string;
    label: string;
    category: string;
    rules: Record<string, unknown>;
  };
  const seed = JSON.parse(
    readFileSync(resolve(__dirname, "fixtures/profiles-seed.json"), "utf8"),
  ) as Seed[];

  // clave de la consola → clave del backend
  const KEYS: [keyof Profile["rules"], string][] = [
    ["turbine", "turbine"],
    ["enc", "encoders"],
    ["imu", "imu"],
    ["commercialPcb", "commercial_pcb"],
    ["motorFam", "motor_families"],
    ["mcu", "allowed_mcus"],
    ["chasisMat", "chassis_materials"],
    ["dim", "dimensions_mm"],
    ["maxSensors", "max_sensors"],
    ["motors", "motors"],
    ["speedMap", "speed_map"],
  ];

  it("la semilla trae los mismos cuatro perfiles", () => {
    expect(seed.map((s) => s.id).sort()).toEqual(PERFILES.map((p) => p.id).sort());
  });

  for (const p of PERFILES)
    it(`perfil ${p.id}: las claves de la tabla coinciden`, () => {
      const s = seed.find((x) => x.id === p.id)!;
      expect(s.competition).toBe(p.comp);
      expect(s.category).toBe(p.cat);
      const diffs = KEYS.filter(
        ([mine, theirs]) =>
          JSON.stringify(p.rules[mine] ?? null) !== JSON.stringify(s.rules[theirs] ?? null),
      ).map(([mine, theirs]) => `${mine}↔${theirs}`);
      expect(diffs).toEqual([]);
    });
});
