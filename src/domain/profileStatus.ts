// Textos de estado del perfil de reglamento activo (HU-10, F3): motivo de la función de velocidad
// por mapa en el formato común de bloqueos y nombre accesible del chip de la barra superior.
import type { Profile } from "@/domain/models/domain";
import { profileLabel, type Block } from "@/domain/profileBlocks";

/** Texto cuando el perfil permite el mapa de velocidad pero el curso aún no lo implementa. */
export const SPEED_MAP_PENDING =
  "Permitido por este perfil, pero la función queda fuera de este curso (HU-33).";

/** ¿El perfil prohíbe la velocidad por mapa? Mismo formato que los bloqueos del Armador. */
export function speedMapBlock(profile: Profile): Block {
  return profile.rules.speedMap
    ? { blocked: false, reason: "" }
    : {
        blocked: true,
        reason: `Velocidad por mapa no permitida en ${profileLabel(profile)}: el robot solo puede guiarse por la línea, sin movimientos pre-programados.`,
      };
}

/** Nombre accesible del chip: perfil, estado de cumplimiento en palabras y a dónde lleva. */
export function regChipLabel(profile: Profile, robotName: string, complies: boolean): string {
  return `Perfil de reglamento ${profileLabel(profile)}: ${robotName} ${complies ? "cumple" : "no cumple"} el reglamento. Abrir perfiles de reglamento`;
}
