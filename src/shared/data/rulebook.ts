// Perfiles de reglamento como datos (HU-10, SP-01) y reglas generales, del prototipo (Protoripo.html).
import type { Profile, ProfileRules } from "@/domain/models/domain";

export const PERFILES: Profile[] = [
  {
    id: "mr4a",
    comp: "Muchik Rumble 4",
    tag: "MR4",
    cat: "Amateur",
    rules: {
      dim: [200, 250],
      maxSensors: 8,
      motors: 2,
      motorFam: ["TT amarillo"],
      wheels: 2,
      drivers: 1,
      mcu: ["Arduino UNO", "Arduino Nano", "Raspberry Pi Pico", "ESP32"],
      turbine: false,
      commercialPcb: false,
      mounting: "Protoboard, cableado directo, shield genérico o PCB propia",
      chassis: "Obligatorio: impresión 3D o MDF",
      chasisMat: ["3D", "MDF"],
      startMode: "Interruptor, pulsador, IR o Bluetooth",
      wireless: false,
      enc: false,
      imu: false,
      speedMap: false,
      mr4: true,
    },
  },
  {
    id: "mr4s",
    comp: "Muchik Rumble 4",
    tag: "MR4",
    cat: "Senior",
    rules: {
      dim: [200, 250],
      maxSensors: null,
      motors: 2,
      motorFam: null,
      wheels: 2,
      drivers: null,
      mcu: null,
      turbine: false,
      commercialPcb: true,
      mounting: "Libre",
      chassis: "Libre",
      startMode: "Inalámbrico",
      wireless: true,
      enc: false,
      imu: false,
      speedMap: false,
      mr4: true,
    },
  },
  {
    id: "mr4m",
    comp: "Muchik Rumble 4",
    tag: "MR4",
    cat: "Master",
    rules: {
      dim: [300, 300],
      maxSensors: null,
      motors: null,
      motorFam: null,
      wheels: null,
      drivers: null,
      mcu: null,
      turbine: true,
      commercialPcb: true,
      mounting: "Libre (se admiten robots comerciales)",
      chassis: "Libre",
      startMode: "Inalámbrico",
      wireless: true,
      enc: false,
      imu: false,
      speedMap: false,
      mr4: true,
    },
  },
  {
    id: "club",
    comp: "Pruebas del club",
    tag: "Club",
    cat: "Libre",
    rules: {
      dim: null,
      maxSensors: null,
      motors: null,
      motorFam: null,
      wheels: null,
      drivers: null,
      mcu: null,
      turbine: true,
      commercialPcb: true,
      mounting: "Libre",
      chassis: "Libre",
      startMode: "Libre",
      wireless: false,
      enc: true,
      imu: true,
      speedMap: true,
      mr4: false,
    },
  },
];

/** Reglas generales de la competencia, para la tabla informativa del reglamento. */
export const GENERALES: [string, string][] = [
  [
    "El robot se mueve solo por el sensado de la línea",
    "Sin movimientos pre-programados, control remoto, otros sensores ni encoders.",
  ],
  ["Una vuelta por intento, en 3 rondas", "Vale el menor tiempo de las tres rondas."],
  ["Máximo 120 s por intento", "Si no llega a la meta es ronda nula. En la consola: J = 120."],
  ["1 minuto para estar listo", "Incluye colocar el robot y calibrar los sensores."],
  [
    "Recuperación autónoma en 10 s",
    "Si sale de la pista, debe volver solo sin saltarse un sector.",
  ],
  [
    "Pista",
    "Línea de 19 mm negra sobre blanco o viceversa; curvas de Ø ≥ 30 cm; ángulos ≥ 90°; rampas ≤ 30°; puede haber túneles.",
  ],
  ["Sensores de tiempo a ≥ 30 cm de la línea", "Aplica a los postes del cronómetro de meta."],
  [
    "Amateur y Senior: robot de fabricación propia",
    "Senior: una PCB con agujero para turbina pasa a Master.",
  ],
];

/** Filas de la tabla comparativa de reglas por categoría (HU-10). */
export const REGLAS: [string, (r: ProfileRules) => string][] = [
  ["Dimensiones máx.", (r) => (r.dim ? `${r.dim[0] / 10} × ${r.dim[1] / 10} cm` : "Libre")],
  [
    "Sensores",
    (r) =>
      r.maxSensors ? `Máx. ${r.maxSensors}, solo en módulo (QTR-8A, QTR-8RC, TCRT5000…)` : "Libre",
  ],
  [
    "Motores",
    (r) =>
      r.motorFam
        ? `Solo ${r.motors} motorreductores amarillos o celestes, sin modificar`
        : r.motors
          ? `Solo ${r.motors}`
          : "Libre",
  ],
  ["Ruedas", (r) => (r.wheels ? `Solo ${r.wheels}` : "Libre")],
  ["Driver", (r) => (r.drivers ? `Libre (solo ${r.drivers})` : "Libre")],
  ["Microcontrolador", (r) => (r.mcu ? r.mcu.join(", ") : "Libre")],
  ["Turbina", (r) => (r.turbine ? "Libre" : "No permitida")],
  ["Montaje", (r) => r.mounting],
  ["Chasis", (r) => r.chassis],
  ["Arranque", (r) => r.startMode],
  ["Encoders e IMU", (r) => (r.enc ? "Permitidos" : "Prohibidos")],
  ["Mapa para la velocidad", (r) => (r.speedMap ? "Permitido" : "Prohibido")],
];
