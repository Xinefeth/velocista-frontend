// Selector de perfil de reglamento (perfiles de la API) y resumen de solo lectura de sus reglas de pista.
// No edita perfiles: eso se hace en la vista "Perfiles de reglamento".
import { RULE_CATALOG, fmt, type RuleDef } from "@/domain/track/rules";
import type { RuleSetting, TrackProfile, TrackRules } from "@/domain/track/types";

/** Texto de una regla activa; las longitudes se guardan en cm y las de recorrido se muestran en metros. */
export function ruleText(def: RuleDef, setting: RuleSetting): string {
  if (def.kind === "bool") return def.label;
  const v = Number(setting.value);
  if (def.id === "length_min" || def.id === "length_max") return `${def.label}: ${fmt(v / 100)} m`;
  return `${def.label}: ${fmt(v)} ${def.unit}`.trim();
}

export function ProfilePicker({
  profiles,
  profileId,
  rules,
  loading,
  error,
  onSelect,
  onRetry,
}: {
  profiles: TrackProfile[];
  profileId: string | null;
  rules: TrackRules | null;
  loading: boolean;
  error: string | null;
  onSelect: (id: string | null) => void;
  onRetry: () => void;
}) {
  const selected = profiles.find((p) => p.id === profileId) ?? null;
  const active = rules
    ? RULE_CATALOG.flatMap((g) => g.items).filter((d) => rules.rules[d.id].enabled)
    : [];
  return (
    <div className="fld">
      <label htmlFor="trk-profile">Perfil de reglamento</label>
      <select
        id="trk-profile"
        className="inp"
        value={profileId ?? ""}
        disabled={loading}
        onChange={(e) => onSelect(e.target.value || null)}
      >
        <option value="">{loading ? "Cargando perfiles…" : "Sin perfil"}</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.rules ? "" : " — sin reglas de pista"}
          </option>
        ))}
      </select>
      {error && (
        <p className="hint warn" role="alert">
          {error}{" "}
          <button type="button" className="sb" onClick={onRetry}>
            Reintentar
          </button>
        </p>
      )}
      {selected && !selected.rules && (
        <p className="hint warn" role="status">
          Este perfil no tiene reglas de pista: no se verifica la pista contra él.
        </p>
      )}
      {!selected && !error && !loading && (
        <p className="note">Elige un perfil para verificar la pista contra sus reglas.</p>
      )}
      {active.length > 0 && (
        <p className="note">
          Reglas activas ({active.length}):{" "}
          {active.map((d) => ruleText(d, rules!.rules[d.id])).join(" · ")}
        </p>
      )}
    </div>
  );
}
