// Robots del armador con sus versiones y piezas, portados del prototipo (Protoripo.html).
// Datos semilla (HU-06). Las versiones nuevas se agregan en memoria desde el armador.
import type { RobotDef } from "@/domain/models/domain";

export const ROBOTS: RobotDef[] = [
  {
    id: "v001",
    name: "Velocista 001",
    short: "001",
    type: "racer",
    fw: "0.3.1",
    versions: [
      {
        v: "v0",
        date: "20 set 2026",
        note: "Prueba de concepto: 1 QTR-8A directo al ESP32",
        status: "discarded",
        parts: {
          mcu: { id: "c01", qty: 1 },
          linea: { id: "c05", qty: 1 },
          motor: { id: "c09", qty: 2 },
          driver: { id: "c12", qty: 1 },
          bat: { id: "c15", qty: 1 },
          reg: { id: "c17", qty: 1 },
          rueda: { id: "c18", qty: 1 },
          chasis: { id: "c20", qty: 1 },
        },
      },
      {
        v: "v1",
        date: "29 set 2026",
        note: "Primer armado: 2 QTR-8A con multiplexor de 16 canales",
        status: "current",
        parts: {
          mcu: { id: "c01", qty: 1 },
          exp: { id: "c04", qty: 1 },
          linea: { id: "c05", qty: 2 },
          mux: { id: "c08", qty: 1 },
          motor: { id: "c09", qty: 2 },
          driver: { id: "c12", qty: 1 },
          bat: { id: "c14", qty: 1 },
          reg: { id: "c16", qty: 1 },
          rueda: { id: "c18", qty: 1 },
          chasis: { id: "c19", qty: 1 },
          sw: { id: "c21", qty: 1 },
        },
      },
    ],
  },
  {
    id: "v002",
    name: "Velocista 002",
    short: "002",
    type: "racer",
    fw: null,
    versions: [
      {
        v: "v1",
        date: "—",
        note: "Concepto para Master: encoders y turbina",
        status: "concept",
        parts: {
          mcu: { id: "c01", qty: 1 },
          exp: { id: "c04", qty: 1 },
          linea: { id: "c05", qty: 2 },
          mux: { id: "c08", qty: 1 },
          motor: { id: "c10", qty: 2 },
          driver: { id: "c12", qty: 1 },
          bat: { id: "c14", qty: 1 },
          reg: { id: "c16", qty: 1 },
          rueda: { id: "c18", qty: 1 },
          chasis: { id: "c25", qty: 1 },
          sw: { id: "c21", qty: 1 },
          enc: { id: "c22", qty: 1 },
          turb: { id: "c24", qty: 1 },
        },
      },
    ],
  },
  {
    id: "ms01",
    name: "MiniSumo RC",
    short: "MS1",
    type: "minisumo",
    fw: null,
    versions: [
      {
        v: "v0",
        date: "12 set 2026",
        note: "Chasis MDF con motores TT",
        status: "current",
        parts: {
          mcu: { id: "c02", qty: 1 },
          motor: { id: "c11", qty: 2 },
          driver: { id: "c13", qty: 1 },
          bat: { id: "c15", qty: 1 },
          reg: { id: "c17", qty: 1 },
          chasis: { id: "c20", qty: 1 },
          sw: { id: "c21", qty: 1 },
        },
      },
    ],
  },
];

/** Nombre legible de cada tipo de robot. */
export const TIPO: Record<string, string> = {
  racer: "Seguidor velocista",
  minisumo: "MiniSumo RC",
};
