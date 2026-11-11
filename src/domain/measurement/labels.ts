// Textos en español de la medición con el celular. El backend responde con códigos en inglés
// (`reason`, `quality`, `warnings`, `verdict`); aquí se traducen para la consola y el celular.
import type { MotionState } from "@/domain/measurement/phone";
import type { MethodApi, QualityApi, VerdictApi } from "@/infrastructure/contracts/measurements";

/** Límites del semáforo de calidad (supuesto del spike SP-05 pendiente del PO). */
export const GREEN_MAX_PCT = 3;
export const YELLOW_MAX_PCT = 6;

export type Tone = "good" | "warn" | "bad";

export const QUALITY: Record<QualityApi, { tone: Tone; tag: string; label: string; desc: string }> =
  {
    green: {
      tone: "good",
      tag: "Confiable",
      label: "Medición confiable",
      desc: `Error de cierre menor a ${GREEN_MAX_PCT} %.`,
    },
    yellow: {
      tone: "warn",
      tag: "Revisar",
      label: "Medición con error moderado",
      desc: `Error de cierre entre ${GREEN_MAX_PCT} % y ${YELLOW_MAX_PCT} %. Puedes repetir.`,
    },
    red: {
      tone: "bad",
      tag: "Repetir",
      label: "Medición con mucho error",
      desc: `Error de cierre mayor a ${YELLOW_MAX_PCT} %. Repite la medición.`,
    },
  };

/** Calidad según el error de cierre en %, con la misma regla que el backend. */
export function qualityOf(closurePct: number): QualityApi {
  if (closurePct < GREEN_MAX_PCT) return "green";
  if (closurePct <= YELLOW_MAX_PCT) return "yellow";
  return "red";
}

export const METHOD_LABEL: Record<MethodApi, string> = {
  steps: "Pasos",
  gps: "GPS",
  car: "Carro + celular",
};

/** Mensajes para los `reason` del backend; si no está, se muestra el `detail` que llegó. */
export const REASONS: Record<string, string> = {
  measurement_not_calibrated: "Falta calibrar: ve al paso Calibrar.",
  measurement_too_short:
    "La medición es muy corta: camina todo el borde (o espera mejor GPS) y vuelve a intentar.",
  measurement_finished: "Esta medición ya terminó. Empieza una nueva.",
  measurement_too_many_readings:
    "Se llegó al máximo de lecturas de esta medición, así que ya no se envían más. Toca «Terminar y calcular» para ver el resultado.",
  measurement_not_found: "La medición no existe.",
  calibration_phone_moved: "El celular se movió. Déjalo quieto sobre la mesa y repite.",
  calibration_too_short: "Calibración muy corta. Repite y espera 5 segundos.",
  calibration_few_samples: "No llegaron lecturas del giroscopio. ¿Activaste los sensores?",
  calibration_few_trials: "Faltan intentos.",
  calibration_step_out_of_range:
    "El largo del paso salió raro. Revisa la distancia y vuelve a caminar.",
  calibration_invalid_trial: "Un intento tiene datos inválidos.",
  model_few_measurements: "Elige al menos 2 mediciones (5 es lo ideal).",
  model_mixed_methods: "Elige mediciones hechas de la misma forma (todas por pasos).",
  model_gps_unsupported: "El modelo ajusta mediciones por pasos o con carro, no por GPS.",
  model_mixed_devices: "Las mediciones deben ser del mismo celular.",
  model_repeated_ids: "Elegiste la misma medición dos veces.",
  gps_trial_few_fixes: "Llegaron pocas lecturas GPS. Quédate más tiempo quieta al aire libre.",
  gps_trial_not_found: "La prueba del GPS no existe.",
  polygon_side_count: "La figura necesita entre 3 y 100 lados.",
  polygon_lengths_mismatch: "Escribe un ángulo por cada lado.",
  polygon_invalid_side: "Los lados deben medir más de 0 m.",
  polygon_invalid_angle: "Los ángulos interiores deben estar entre 0° y 360°.",
  polygon_underdetermined:
    "Faltan demasiados datos: deja vacío a lo sumo un ángulo (o los dos de un mismo lado) y hasta dos lados que no sean paralelos.",
  polygon_does_not_close: "Con esos datos la figura no puede cerrar: revisa lados y ángulos.",
  polygon_degenerate: "Los puntos están en una línea: no hay área.",
  polygon_repeated_point: "Hay dos puntos seguidos iguales.",
  unauthorized: "Debes iniciar sesión.",
  invalid_credentials: "Usuario o contraseña incorrectos.",
};

/** Aviso cuando el token caduca a mitad de una medición: las lecturas pendientes no se pierden. */
export const SESSION_EXPIRED_TEXT =
  "Tu sesión caducó. Inicia sesión de nuevo: las lecturas pendientes se enviarán solas.";

/** Texto para mostrar de un error de la API (o de red). */
export function errorText(error: unknown): string {
  const e = error as { reason?: string; message?: string } | null;
  if (e?.reason && REASONS[e.reason]) return REASONS[e.reason];
  if (e instanceof TypeError)
    return "No hay conexión con el backend. Revisa internet y la dirección.";
  return e?.message || "Ocurrió un error inesperado.";
}

export const WARNINGS: Record<string, string> = {
  end_heading_unknown:
    "Al terminar no volviste a mirar hacia donde empezaste: no se pudo corregir el giroscopio.",
  step_not_calibrated:
    "No calibraste tu paso: se usó 0,70 m. Escribe el primer lado medido para corregirlo.",
  scale_needs_corner: "Para usar el lado medido con cinta, marca al menos una esquina.",
  gps_space_too_small: "El lugar es chico para el GPS: usa la medición por pasos.",
  gps_low_accuracy_dropped: "Se descartaron lecturas GPS con mala precisión.",
  angle_sum_mismatch: "Los ángulos no suman (n − 2) × 180°.",
  does_not_close: "Con esos lados la figura no vuelve al inicio.",
  self_crossing: "Dos lados se cruzan: el área no es válida.",
};

export const VERDICT: Record<VerdictApi, { tone: Tone; label: string; desc: string }> = {
  improves_green: {
    tone: "good",
    label: "El modelo baja el error y llega a verde",
    desc: `Con el modelo el error de cierre queda por debajo de ${GREEN_MAX_PCT} %.`,
  },
  improves_not_green: {
    tone: "warn",
    label: "El modelo baja el error, pero no llega a verde",
    desc: `Mejora frente al algoritmo solo, pero sigue sobre ${GREEN_MAX_PCT} %.`,
  },
  no_improvement: {
    tone: "bad",
    label: "El modelo no baja el error",
    desc: "Se declara así en el informe: el modelo queda como trabajo futuro.",
  },
};

/** Número con el formato de Perú (es-PE), como la página original del celular; `—` si no hay valor. */
export function fmtEs(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("es-PE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Porcentaje con signo (+3.2 %), como se muestra el error frente al plano. */
export function signedPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${fmtEs(value, digits)} %`;
}

/** Código corto de un celular (los 8 primeros caracteres de su id, sin `cel-`). */
export const deviceCode = (deviceId: string): string => deviceId.replace(/^cel-/, "").slice(0, 8);

/** Mapa de pista (HU-30): el mapa sirve para analizar, no para correr. */
export const ANALYSIS_ONLY = "Solo análisis: en competencia el robot no usa el mapa";
export const SHOW_SIMULATOR = "Mostrar simulador (desarrollo)";
export const CAR_UNAVAILABLE = "Con el carro: no disponible (sin modelo de velocidad)";
export const TURN_WARNING_WORD = "Revisar";

/** Estado de movimiento que se muestra mientras se mide (palabra + motivo si no hay datos). */
export const MOTION_LABEL: Record<MotionState, string> = {
  walking: "Caminando",
  still: "Quieto",
  no_data: "Sin datos del acelerómetro",
};
export const MOTION_NO_DATA_REASON =
  "No llegan lecturas desde hace 3 s. Activa los sensores en la pestaña 1 y revisa el permiso de movimiento.";

/** Aviso de lugar chico con el error del GPS medido en SP-06 (HU-37). Los números van con 1 decimal. */
export const GPS_MIN_SIDE_ADVICE = (min: string) =>
  `Con el error de tu GPS, el lado mínimo es ${min} m: si tu terreno es más chico, mide por pasos.`;
export const GPS_NO_TRIALS_ADVICE =
  "Aún no hay pruebas de error del GPS de este celular (pestaña 4). Al terminar, el aviso del servidor sigue diciendo si el lugar es chico.";
export const GPS_TOO_SMALL_RESULT = (side: string, min: string) =>
  `Tu terreno mide unos ${side} m en su lado corto y, con el error de tu GPS, el lado mínimo es ${min} m: es chico para el GPS. Mide por pasos.`;
/** Medición confiable en un terreno menor que el mínimo: se avisa sin contradecir la calidad. */
export const GPS_TOO_SMALL_RELIABLE = (pct: string, side: string, min: string) =>
  `La medición salió confiable (error de cierre ${pct} %), pero tu terreno (lado corto ≈ ${side} m) es más chico que el mínimo recomendado para tu GPS (${min} m). Si quieres más precisión, mide por pasos.`;
/** El mínimo de las pruebas SP-06 no es creíble (alguna prueba salió mal): no se usa para avisar. */
export const GPS_MIN_SIDE_IMPLAUSIBLE = (min: string) =>
  `Tus pruebas de error del GPS dan un lado mínimo de ${min} m, que no es creíble (probablemente alguna prueba salió mal). Repítelas o bórralas en la pestaña 4.`;
export const MEASURE_BY_STEPS = "Medir por pasos";
export const OPEN_GPS_TAB = "Ver el error del GPS (pestaña 4)";

/** Exportar el resultado como plano DXF (F1 del spec de exportar e importar DXF). */
export const EXPORT_DXF = "Exportar DXF";
export const EXPORT_DXF_HINT =
  "Descarga el plano en metros, a tamaño real, para abrirlo en un programa de CAD.";
export const EXPORT_DXF_DONE = (fileName: string) => `Plano descargado: ${fileName}`;
export const EXPORT_DXF_ERROR = "No se pudo generar el plano DXF. Vuelve a intentarlo.";

/** Importar un plano DXF como plano de referencia (F2 del spec de exportar e importar DXF). */
export const IMPORT_DXF_CHOOSE = "Elegir archivo .dxf";
export const IMPORT_DXF_CHANGE = "Elegir otro archivo";
export const IMPORT_DXF_REMOVE = "Quitar archivo";
export const IMPORT_DXF_HINT =
  "El dibujo se toma a tamaño real. El archivo se lee en tu navegador y no se envía a ningún servidor.";
export const IMPORT_DXF_UNIT = "Unidad del archivo";
export const IMPORT_DXF_UNIT_ASK =
  "El archivo no dice en qué unidad está dibujado. Elige la unidad (se propone metros).";
export const IMPORT_DXF_CONTOURS = "Contornos cerrados del dibujo";
export const IMPORT_DXF_TOO_BIG = "El archivo pesa más de 5 MB: usa un plano más liviano.";
export const IMPORT_DXF_READ_ERROR = "No se pudo leer el archivo. Vuelve a elegirlo.";
export const IMPORT_DXF_UNIT_SOURCE = {
  header: "del archivo",
  asked: "elegida por ti",
} as const;
