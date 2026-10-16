// Vista Armador de robots (Protoripo.html): registra robots y versiones desde el catálogo,
// con costo/masa/consumo, compatibilidad y cumplimiento del reglamento.
// HU-06, HU-07, HU-08, HU-09, HU-10.
import { useEffect, useState } from "react";
import { useConsole, RANURAS } from "@/application/state/ConsoleContext";
import { Card } from "@/ui/components/Card";
import { ICO, Spark, Plus } from "@/ui/components/UiIcons";
import { TIPO } from "@/shared/data/robots";
import {
  byId,
  checks,
  compat,
  currentVersion,
  facts,
  saveParts,
  manifest,
  manifestPanels,
} from "@/domain/rules";
import { clamp, clone, fmt, money, VERSION_STATUS_LABEL } from "@/domain/format";
import type { Parts, RobotDef } from "@/domain/models/domain";

export function Builder() {
  const c = useConsole();
  const [abRobot, setAbRobot] = useState(c.initialBuilderRobot ?? "v001");
  const [abView, setAbView] = useState<number | null>(null);
  const [abDraft, setAbDraft] = useState<Parts | null>(null);

  useEffect(() => {
    if (c.initialBuilderRobot) {
      setAbRobot(c.initialBuilderRobot);
      setAbView(null);
      setAbDraft(null);
    }
  }, [c.initialBuilderRobot]);

  const r = c.robots.find((x) => x.id === abRobot) ?? c.robots[0];
  const vi = abView == null ? r.versions.length - 1 : abView;
  const v = r.versions[vi];
  const isCur = vi === r.versions.length - 1;
  const parts = abDraft && isCur ? abDraft : v.parts;
  const f = facts(parts, c.catalog);
  const orig = v.parts;
  const dirty = !!abDraft && isCur && JSON.stringify(abDraft) !== JSON.stringify(v.parts);

  const edit = (fn: (d: Parts) => void) => {
    const d: Parts = abDraft ? { ...abDraft } : clone(v.parts);
    fn(d);
    setAbDraft(d);
  };

  const guardar = () => {
    if (!abDraft) return;
    const d = abDraft;
    const diff = RANURAS.filter(
      (sl) => JSON.stringify(v.parts[sl.key] || null) !== JSON.stringify(d[sl.key] || null),
    ).map((sl) => {
      const a = v.parts[sl.key] && byId(c.catalog, v.parts[sl.key]!.id);
      const b = d[sl.key] && byId(c.catalog, d[sl.key]!.id);
      return a && b && a.id === b.id
        ? `${sl.name} ×${d[sl.key]!.qty}`
        : `${sl.name}: ${b ? b.name : "sin pieza"}`;
    });
    const nota = diff.join("; ") || "Cambio de piezas";
    if (c.apiMode) {
      void c.saveVersion(r.id, r.currentVersionId ?? null, d, nota).then((ok) => {
        if (ok) {
          setAbDraft(null);
          setAbView(null);
        }
      });
      return;
    }
    const { robot: actualizado, version: nv } = saveParts(r, d, nota);
    c.setRobots((list) => list.map((x) => (x.id === r.id ? actualizado : x)));
    setAbDraft(null);
    setAbView(null);
    c.log("Armador", `${r.name} ${nv.v}: ${nv.note}`, "good");
    c.showToast(`${r.name} ${nv.v} guardado. Las corridas nuevas se asignan a esta versión.`);
  };

  const nuevoRobot = async () => {
    if (c.apiMode) {
      const creado = await c.createRobot();
      if (creado) {
        setAbRobot(creado.id);
        setAbView(null);
        setAbDraft(null);
      }
      return;
    }
    const n = c.robots.filter((x) => x.type === "racer").length + 1;
    const id = "v" + String(n).padStart(3, "0");
    const nuevo: RobotDef = {
      id,
      name: `Velocista ${String(n).padStart(3, "0")}`,
      short: String(n).padStart(3, "0"),
      type: "racer",
      fw: null,
      versions: [{ v: "v1", date: "hoy", note: "Borrador", status: "draft", parts: {} }],
    };
    c.setRobots((list) => [...list, nuevo]);
    setAbRobot(id);
    setAbView(null);
    setAbDraft(null);
    c.showToast("Robot creado: elige sus piezas del catálogo.");
  };

  const aut = f.bat && f.current ? (Number(f.bat.specs.mah) / (f.current * 1000)) * 60 * 0.8 : null;
  const cp = compat(f);
  const nb = cp.filter((x) => x[0] === "bad").length;
  const nw = cp.filter((x) => x[0] === "warn").length;
  const ck = checks(f, c.profile);
  const declaredManifest = manifest(
    { ...r, versions: [{ ...v, parts }] },
    c.catalog,
    c.applied.controller,
    c.comp,
  );
  const expo = manifestPanels(declaredManifest).map((panel) => {
    if (panel.id === "regleta") return `Regleta de ${f.sensors} canales`;
    if (panel.id === "bateria") return "Voltaje de batería";
    return panel.nombre;
  });
  if (f.radio !== "Ninguna") expo.push(`Arranque inalámbrico (${f.radio.split(" ")[0]})`);

  return (
    <section className="view on ab" aria-label="Armador">
      <div className="stack">
        <Card pbi="HU-06" sprint="1">
          <div className="hd">
            <h2>Robots</h2>
            <span className="tag">{c.robots.length}</span>
          </div>
          <div className="rlist">
            {c.robots.map((x) => (
              <button
                key={x.id}
                type="button"
                className="rli"
                aria-current={x.id === abRobot}
                onClick={() => {
                  setAbDraft(null);
                  setAbRobot(x.id);
                  setAbView(null);
                }}
              >
                <span className="ic">{x.type === "racer" ? ICO.velo : ICO.sumo}</span>
                <b>{x.name}</b>
                <small>
                  {TIPO[x.type]} · {currentVersion(x).v} ·{" "}
                  {x.fw ? `Firmware ${x.fw}` : "Sin firmware"} ·{" "}
                  {VERSION_STATUS_LABEL[currentVersion(x).status] ?? currentVersion(x).status}
                </small>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="sb ghost"
            style={{ width: "100%", marginTop: 10 }}
            onClick={nuevoRobot}
          >
            <Plus />
            Nuevo robot
          </button>
        </Card>
      </div>

      <div className="stack">
        <Card pbi="HU-06" sprint="1">
          <div className="hd">
            <h2>{r.name}</h2>
            <div className="vchips">
              {r.versions.map((x, i) => (
                <button
                  key={i}
                  type="button"
                  className={`tag ${i === vi ? "red" : ""}`}
                  onClick={() => {
                    if (i !== r.versions.length - 1) setAbDraft(null);
                    setAbView(i);
                  }}
                >
                  {x.v}
                  {i === r.versions.length - 1 ? " · actual" : ""}
                </button>
              ))}
            </div>
          </div>
          <p className="note" style={{ margin: "-4px 0 12px" }}>
            {TIPO[r.type]} · {v.note} · {v.date !== "—" ? v.date + " · " : ""}
            {r.fw ? "firmware " + r.fw : "sin firmware"}
            {isCur ? "" : " · versión anterior: solo lectura"}
          </p>
          <div className="slothead">
            <span>Pieza</span>
            <span>Component del catálogo</span>
            <span className="r">Cantidad</span>
            <span className="r">Subtotal</span>
            <span className="r">Masa</span>
          </div>
          <div className="slots">
            {RANURAS.map((sl) => {
              const p = parts[sl.key];
              const comp = p && byId(c.catalog, p.id);
              const chg =
                !!abDraft &&
                isCur &&
                JSON.stringify(orig[sl.key] || null) !== JSON.stringify(p || null);
              return (
                <div key={sl.key} className={`slot ${sl.opt ? "opt" : ""} ${chg ? "chg" : ""}`}>
                  <div className="sl">
                    {sl.name}
                    <small>
                      {sl.req ? "obligatorio" : sl.opt ? "opcional · según reglamento" : "opcional"}
                    </small>
                  </div>
                  <select
                    className="inp"
                    disabled={!isCur}
                    aria-label={sl.name}
                    value={p?.id ?? ""}
                    onChange={(e) =>
                      edit((d) => {
                        if (!e.target.value) delete d[sl.key];
                        else
                          d[sl.key] = {
                            id: e.target.value,
                            qty: d[sl.key] ? d[sl.key]!.qty : sl.key === "motor" ? 2 : 1,
                          };
                      })
                    }
                  >
                    <option value="">— Ninguno —</option>
                    {c.catalog
                      .filter((x) => x.typeId === sl.typeId)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} · {money(x.price)}
                        </option>
                      ))}
                  </select>
                  <div className="q">
                    {sl.qty && p ? (
                      <>
                        <button
                          type="button"
                          disabled={!isCur}
                          aria-label="Menos"
                          onClick={() =>
                            edit((d) => (d[sl.key]!.qty = clamp(d[sl.key]!.qty - 1, 1, 4)))
                          }
                        >
                          −
                        </button>
                        <span>{p.qty}</span>
                        <button
                          type="button"
                          disabled={!isCur}
                          aria-label="Más"
                          onClick={() =>
                            edit((d) => (d[sl.key]!.qty = clamp(d[sl.key]!.qty + 1, 1, 4)))
                          }
                        >
                          +
                        </button>
                      </>
                    ) : (
                      <span className="dimt">{p ? "×" + p.qty : ""}</span>
                    )}
                  </div>
                  <div className="pr">{comp ? money(comp.price * p!.qty) : "—"}</div>
                  <div className="ms">{comp ? comp.mass * p!.qty + " g" : "—"}</div>
                </div>
              );
            })}
          </div>
          {dirty && (
            <div className="unsaved">
              <span>Tienes cambios sin guardar en las piezas.</span>
              <span style={{ display: "flex", gap: 6 }}>
                <button type="button" className="sb ghost" onClick={() => setAbDraft(null)}>
                  Descartar
                </button>
                <button type="button" className="sb red" onClick={guardar}>
                  Guardar como nueva versión
                </button>
              </span>
            </div>
          )}
          <div
            style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}
            data-sprint="W"
          >
            <button type="button" className="sb ghost" disabled title="Fuera de este curso (HU-12)">
              <Spark />
              Sugerir piezas por objetivo
            </button>
          </div>
        </Card>

        <Card pbi="HU-09" sprint="2">
          <div className="hd">
            <h2>
              Versiones <small>comparación</small>
            </h2>
          </div>
          <div className="table">
            <table className="ct" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Versión</th>
                  <th>Cambio</th>
                  <th className="r">Costo</th>
                  <th className="r">Masa</th>
                  <th className="r">Corridas</th>
                  <th className="r">Mejor vuelta</th>
                  <th className="r">J medio</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {r.versions.map((x, i) => {
                  const fx = facts(x.parts, c.catalog);
                  const rr = c.runs.filter((z) => z.robot === r.id && z.ver === x.v);
                  const ft = rr.filter((z) => z.fin);
                  const bst = ft.length ? Math.min(...ft.map((z) => z.t!)) : null;
                  const jm = rr.length ? rr.reduce((a, z) => a + z.J, 0) / rr.length : null;
                  return (
                    <tr
                      key={i}
                      style={i === vi ? { background: "rgba(255,45,85,.05)" } : undefined}
                    >
                      <td className="m">{x.v}</td>
                      <td className="sp">{x.note}</td>
                      <td className="m r">{money(fx.cost)}</td>
                      <td className="m r">{Math.round(fx.mass)} g</td>
                      <td className="m r">{rr.length}</td>
                      <td className="m r">{bst != null ? fmt(bst, 3) : "—"}</td>
                      <td className="m r">{jm != null ? fmt(jm, 2) : "—"}</td>
                      <td>
                        <span
                          className={`badge ${x.status === "current" ? "good" : x.status === "discarded" || x.status === "previous" ? "" : "warn"}`}
                        >
                          {VERSION_STATUS_LABEL[x.status] ?? x.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="stack">
        <Card pbi="HU-07" sprint="1">
          <div className="hd">
            <h2>Resumen</h2>
            <span
              className={`tag ${v.status === "current" ? "good" : v.status === "concept" || v.status === "draft" ? "warn" : ""}`}
            >
              {VERSION_STATUS_LABEL[v.status] ?? v.status}
            </span>
          </div>
          <div className="bigsum">
            <div>
              <div className="lbl">Costo total</div>
              <div className="v">{money(f.cost)}</div>
            </div>
            <div>
              <div className="lbl">Masa</div>
              <div className="v">
                {Math.round(f.mass)}
                <small> g</small>
              </div>
            </div>
            <div>
              <div className="lbl">Consumo estimado</div>
              <div className="v">
                {fmt(f.current, 2)}
                <small> A</small>
              </div>
            </div>
            <div>
              <div className="lbl">Autonomía</div>
              <div className="v">
                {aut ? Math.round(aut) : "—"}
                <small> min</small>
              </div>
            </div>
            <div>
              <div className="lbl">Dimensiones</div>
              <div className="v" style={{ fontSize: 17 }}>
                {f.ancho ? `${f.ancho} × ${f.length}` : "—"}
                <small> mm</small>
              </div>
            </div>
            <div>
              <div className="lbl">Sensores de línea</div>
              <div className="v">{f.sensors || "—"}</div>
            </div>
          </div>
          <div className="sub" style={{ marginTop: 12 }}>
            Lo que expone a la consola
          </div>
          <div className="expo">
            {expo.length ? (
              expo.map((x, i) => (
                <span key={i}>
                  <i />
                  {x}
                </span>
              ))
            ) : (
              <span className="dimt">Agrega piezas para ver qué expone.</span>
            )}
          </div>
          <button
            type="button"
            className="sb ghost"
            style={{ width: "100%", marginTop: 10 }}
            disabled={r.type !== "racer"}
            onClick={() => c.openManifest(r.id)}
          >
            Ver manifiesto esperado
          </button>
        </Card>

        <Card pbi="HU-08" sprint="2">
          <div className="hd">
            <h2>Compatibilidad</h2>
            <span className={`tag ${nb ? "red" : nw ? "warn" : "good"}`}>
              {nb
                ? `${nb} error${nb > 1 ? "es" : ""}`
                : nw
                  ? `${nw} aviso${nw > 1 ? "s" : ""}`
                  : "Todo OK"}
            </span>
          </div>
          <ul className="checks">
            {cp.length ? (
              cp.map(([s, t, d], i) => (
                <li key={i} className={s}>
                  {ICO[s]}
                  <span>
                    <b>{t}</b>
                    <small>{d}</small>
                  </span>
                </li>
              ))
            ) : (
              <li className="ok">
                {ICO.ok}
                <span>
                  <b>Sin piezas que revisar</b>
                </span>
              </li>
            )}
          </ul>
        </Card>

        <Card pbi="HU-10" sprint="2">
          <div className="hd">
            <h2>Reglamento</h2>
            <button
              type="button"
              className={`tag ${ck.some((x) => x[0] === "bad") ? "red" : "good"}`}
              onClick={() => c.goTab("rules")}
            >
              {c.profile.tag} · {c.profile.cat}
            </button>
          </div>
          <ul className="checks">
            {ck.map(([s, t, d], i) => (
              <li key={i} className={s}>
                {ICO[s]}
                <span>
                  <b>{t}</b>
                  <small>{d}</small>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}
