// Pista diseñada frente a pista medida (HU-30, CU-2): el carro (o una persona) da una vuelta con
// el celular por la pista marcada en el piso; aquí se dibuja sobre el diseño del Trazador y se
// comparan largo, área, cierre y giro sobrante. Solo análisis: en competencia el robot no usa el mapa.
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/ui/components/Card";
import { Hint, Semaforo } from "@/ui/components/measurement/MeasurementUi";
import { grid, line, start, surface } from "@/ui/components/measurement/draw";
import { useCanvas } from "@/application/hooks/useCanvas";
import { errorText, fmtEs, METHOD_LABEL, QUALITY, signedPct } from "@/domain/measurement/labels";
import { boundsOf, fitView } from "@/domain/measurement/plot";
import { alignTo, compareTrack, designPath, laps } from "@/domain/measurement/trackCompare";
import { measurementsApi } from "@/infrastructure/http/measurements";
import { tracksApi } from "@/infrastructure/http/tracks";
import type { MeasurementApi } from "@/infrastructure/contracts/measurements";
import type { Track } from "@/domain/track/types";

export function TrackComparison() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [items, setItems] = useState<MeasurementApi[]>([]);
  const [trackId, setTrackId] = useState<number | "">("");
  const [lapId, setLapId] = useState<number | "">("");
  const [lap, setLap] = useState<MeasurementApi | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([tracksApi.list(), measurementsApi.list()])
      .then(([ts, page]) => {
        if (!alive) return;
        setTracks(ts);
        setItems(laps(page.items));
        setTrackId(ts[0]?.id ?? "");
        setLapId(laps(page.items)[0]?.id ?? "");
      })
      .catch((e) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, []);

  // El listado no trae los recorridos: se pide la vuelta elegida completa.
  useEffect(() => {
    if (lapId === "") return setLap(null);
    let alive = true;
    measurementsApi
      .get(lapId)
      .then((m) => alive && setLap(m))
      .catch((e) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [lapId]);

  const track = tracks.find((t) => t.id === trackId) ?? null;
  const design = useMemo(() => (track ? designPath(track) : []), [track]);
  const measured = useMemo(
    () => (lap?.result ? alignTo(design, lap.result.corrected_path) : []),
    [design, lap],
  );
  const raw = useMemo(
    () => (lap?.result ? alignTo(design, lap.result.raw_path) : []),
    [design, lap],
  );
  const rows = track && lap ? compareTrack(track, lap) : [];
  const q = lap?.result ? QUALITY[lap.result.quality] : null;

  const ref = useCanvas((cv) => {
    const s = surface(cv);
    if (!s) return;
    const b = boundsOf(design, measured, raw);
    if (!b) return;
    const view = fitView(b, s.w, s.h, 26, 1);
    grid(s, view);
    line(s, view, design, { color: s.color("--ink"), width: 1.6, dash: [6, 5], closed: true });
    line(s, view, raw, { color: s.color("--mid"), width: 1.2, dash: [3, 4] });
    line(s, view, measured, { color: s.color("--red"), width: 2.4 });
    if (measured.length) start(s, view, measured[0]);
  });

  return (
    <>
      <Card className="s8" pbi="HU-30" sprint="2">
        <div className="hd">
          <h2>Pista diseñada frente a pista medida</h2>
          <span className="tag purple">Comparación</span>
        </div>
        <div className="cv h360">
          <canvas ref={ref} role="img" aria-label="Pista diseñada y pista medida" />
        </div>
        <div className="legend">
          <span>
            <i className="ln dash" style={{ borderColor: "var(--ink)" }} />
            Diseño
          </span>
          <span>
            <i className="ln dash" />
            Estimado
          </span>
          <span>
            <i className="ln" style={{ borderColor: "var(--red)" }} />
            Corregido (alineado por el centro)
          </span>
        </div>
      </Card>
      <div className="stack s4">
        <Card pbi="HU-30" sprint="2">
          <div className="hd">
            <h2>Dar una vuelta</h2>
          </div>
          <div className="rows" style={{ marginTop: 0 }}>
            <label className="fld">
              <span className="lbl">Pista diseñada</span>
              <select
                className="inp"
                aria-label="Pista diseñada"
                value={trackId}
                onChange={(e) => setTrackId(e.target.value ? Number(e.target.value) : "")}
              >
                {!tracks.length && <option value="">Sin pistas en el Trazador</option>}
                {tracks.map((t) => (
                  <option key={t.id} value={t.id ?? ""}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="fld">
              <span className="lbl">Vuelta medida con el celular</span>
              <select
                className="inp"
                aria-label="Vuelta medida"
                value={lapId}
                onChange={(e) => setLapId(e.target.value ? Number(e.target.value) : "")}
              >
                {!items.length && <option value="">Sin vueltas medidas</option>}
                {items.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.place_name} #{m.id} · {METHOD_LABEL[m.method]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ol className="steps" style={{ margin: "14px 0 0" }}>
            <li className="done">
              <span>1</span>Marca en el piso la pista diseñada en el Trazador.
            </li>
            <li className={lap ? "done" : "cur"}>
              <span>2</span>El carro (o una persona) da una vuelta con el celular midiendo.
            </li>
            <li className={lap ? "done" : "todo"}>
              <span>3</span>Se corrige la deriva para que la vuelta cierre en la meta.
            </li>
          </ol>
          <Hint text={error} error />
        </Card>
        <Card>
          <div className="hd">
            <h2>Resultado</h2>
          </div>
          {lap?.result && q ? (
            <Semaforo
              tone={q.tone}
              title={q.label}
              sub={`Error de cierre ${fmtEs(lap.result.closure_error_pct, 1)} %`}
            />
          ) : (
            <Semaforo title="Sin medición" sub="Elige una vuelta medida para ver el error." />
          )}
        </Card>
      </div>
      <Card className="s12" pbi="HU-30" sprint="2">
        <div className="tw">
          <table className="t" aria-label="Diseño frente a medido">
            <thead>
              <tr>
                <th className="l">Dato</th>
                <th>Diseño</th>
                <th>Medido</th>
                <th>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length && (
                <tr>
                  <td className="l" colSpan={4}>
                    Elige una pista y una vuelta medida para ver la comparación.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="l">{r.label}</td>
                  <td>
                    {fmtEs(r.design, 2)} {r.unit}
                  </td>
                  <td>
                    {fmtEs(r.measured, 2)} {r.unit}
                  </td>
                  <td>{r.diffPct == null ? "—" : signedPct(r.diffPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          El diseño sale del Trazador de pistas. El mapa medido sirve para analizar, no para correr:
          el reglamento exige guiarse solo por la línea.
        </p>
      </Card>
    </>
  );
}
