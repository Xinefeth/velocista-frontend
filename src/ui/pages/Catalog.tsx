// Vista Catálogo (Protoripo.html): componentes con specs, precios e inventario del club.
// HU-01 a HU-05, EN-17. Usa los componentes comunes de gestión (EN-06).
import { useMemo, useState, type CSSProperties } from "react";
import { useConsole } from "@/application/state/ConsoleContext";
import { Card } from "@/ui/components/Card";
import { Plus } from "@/ui/components/UiIcons";
import {
  SearchBox,
  FilterChips,
  Tabs,
  DataTable,
  useListFilter,
  type Column,
} from "@/ui/components/management/index";
import { TIPOS, ORDEN_TIPOS } from "@/shared/data/componentTypes";
import { currentVersion } from "@/domain/rules";
import { money } from "@/domain/format";
import type { Component, RobotDef } from "@/domain/models/domain";

const tchip = (t: string) => (
  <span className="tchip" style={{ "--tc": TIPOS[t].color } as CSSProperties}>
    <i />
    {TIPOS[t].name}
  </span>
);

const PESTANAS = [
  { id: "comp", etiqueta: "Componentes" },
  { id: "inv", etiqueta: "Inventario del club" },
];

// Funciones estables (fuera del componente) para que el filtro no se recalcule en cada render.
const textoBuscable = (x: Component) =>
  `${x.name} ${TIPOS[x.typeId].name} ${TIPOS[x.typeId].summary(x.specs)} ${x.store}`;
const categoriaDe = (x: Component) => x.typeId;
const porTipoYNombre = (a: Component, b: Component) =>
  ORDEN_TIPOS.indexOf(a.typeId) - ORDEN_TIPOS.indexOf(b.typeId) || a.name.localeCompare(b.name);

export function Catalog() {
  const c = useConsole();
  const [tabCat, setTabCat] = useState("comp");

  const ordenado = useMemo(() => [...c.catalog].sort(porTipoYNombre), [c.catalog]);
  const filtro = useListFilter(ordenado, { texto: textoBuscable, categoria: categoriaDe });
  const lista = filtro.filtradas;

  const usedIn = (id: string): { r: RobotDef; q: number }[] =>
    c.robots
      .map((r) => {
        const p = Object.values(currentVersion(r).parts).find((x) => x && x.id === id);
        return p ? { r, q: p.qty } : null;
      })
      .filter((x): x is { r: RobotDef; q: number } => x != null);
  const usedQty = (id: string) => usedIn(id).reduce((a, x) => a + x.q, 0);
  const sinUso = <span className="dimt">—</span>;

  let miss = 0;
  c.catalog.forEach((x) => {
    if (x.stock - usedQty(x.id) < 0) miss++;
  });

  const columnasLista: Column<Component>[] = [
    {
      id: "nombre",
      encabezado: "Component",
      clase: "nm",
      celda: (x) => (
        <>
          <b>{x.name}</b>
          <small>{x.id.toUpperCase()}</small>
        </>
      ),
    },
    { id: "tipo", encabezado: "Tipo", celda: (x) => tchip(x.typeId) },
    {
      id: "specs",
      encabezado: "Especificaciones clave",
      clase: "sp",
      celda: (x) => TIPOS[x.typeId].summary(x.specs),
    },
    {
      id: "precio",
      encabezado: "Precio",
      clase: "m",
      derecha: true,
      celda: (x) => money(x.price),
    },
    { id: "masa", encabezado: "Masa", clase: "m", derecha: true, celda: (x) => `${x.mass} g` },
    { id: "tienda", encabezado: "Tienda", clase: "sp", celda: (x) => x.store },
    {
      id: "club",
      encabezado: "Club",
      derecha: true,
      celda: (x) => (
        <span className={`stock ${x.stock === 0 ? "zero" : x.stock <= 1 ? "low" : ""}`}>
          {x.stock}
        </span>
      ),
    },
    {
      id: "enUso",
      encabezado: "En uso",
      clase: "sp",
      celda: (x) => {
        const u = usedIn(x.id);
        return u.length ? u.map((z) => z.r.name).join(", ") : sinUso;
      },
    },
  ];

  const columnasInventario: Column<Component>[] = [
    {
      id: "nombre",
      encabezado: "Component",
      clase: "nm",
      celda: (x) => <b>{x.name}</b>,
    },
    { id: "tipo", encabezado: "Tipo", celda: (x) => tchip(x.typeId) },
    { id: "club", encabezado: "En el club", clase: "m", derecha: true, celda: (x) => x.stock },
    {
      id: "enRobots",
      encabezado: "En robots",
      clase: "m",
      derecha: true,
      celda: (x) => usedQty(x.id),
    },
    {
      id: "disponible",
      encabezado: "Disponible",
      clase: "m",
      derecha: true,
      celda: (x) => {
        const d = x.stock - usedQty(x.id);
        return <span style={{ color: d < 0 ? "var(--red-hi)" : "" }}>{d}</span>;
      },
    },
    {
      id: "estado",
      encabezado: "Estado",
      celda: (x) => {
        const u = usedQty(x.id);
        const d = x.stock - u;
        return d < 0 ? (
          <span className="badge bad">Faltan {-d}</span>
        ) : d === 0 && u ? (
          <span className="badge warn">Todo en uso</span>
        ) : (
          <span className="badge good">Disponible</span>
        );
      },
    },
    {
      id: "usadoEn",
      encabezado: "Usado en",
      clase: "sp",
      celda: (x) =>
        usedIn(x.id)
          .map((z) => `${z.r.name} ×${z.q}`)
          .join(", ") || sinUso,
    },
  ];

  return (
    <section className="view on dv" aria-label="Catálogo">
      <div className="s12">
        <Tabs
          pestanas={PESTANAS}
          activa={tabCat}
          alCambiar={setTabCat}
          etiqueta="Secciones del catálogo"
        />
      </div>

      <Card
        className="s12"
        pbi="HU-01 · HU-03"
        sprint="1"
        {...(tabCat !== "comp" ? { hidden: true } : {})}
      >
        <div className="bar2">
          <SearchBox
            valor={filtro.consulta}
            alCambiar={filtro.setConsulta}
            marcador="Buscar por nombre, tipo o especificación"
            etiqueta="Buscar componentes"
          />
          <div className="spacer" />
          <button type="button" className="sb red" onClick={c.openRegistration}>
            <Plus />
            Registrar componente
          </button>
        </div>
        <FilterChips
          etiqueta="Filtrar por tipo"
          valor={filtro.categoria}
          alCambiar={filtro.setCategoria}
          cantidadTodos={c.catalog.length}
          opciones={ORDEN_TIPOS.filter((t) => filtro.conteos[t]).map((t) => ({
            valor: t,
            etiqueta: TIPOS[t].name,
            cantidad: filtro.conteos[t],
          }))}
          style={{ marginBottom: 12 }}
        />
        <DataTable
          etiqueta="Componentes del catálogo"
          columnas={columnasLista}
          filas={lista}
          clave={(x) => x.id}
          alHacerClic={(x) => c.openDetails(x.id)}
          vacio={`Nada coincide con “${filtro.consulta}”.`}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <p className="note">{`${lista.length} de ${c.catalog.length} componentes · precios en soles, por unidad`}</p>
          <button
            type="button"
            className="sb ghost"
            title="Borra lo que registraste a mano y vuelve a los datos de ejemplo"
            onClick={() => {
              if (
                window.confirm(
                  "Se borrarán los componentes y robots que registraste y se volverá a los datos de ejemplo. ¿Continuar?",
                )
              )
                c.resetData();
            }}
          >
            Restablecer datos de ejemplo
          </button>
        </div>
      </Card>

      <Card
        className="s12"
        pbi="HU-04 · EN-17"
        sprint="1"
        {...(tabCat !== "inv" ? { hidden: true } : {})}
      >
        <div className="hd">
          <h2>Inventario del club</h2>
          <span className={`tag ${miss ? "warn" : "good"}`}>
            {miss ? `${miss} por comprar` : "Completo"}
          </span>
        </div>
        <DataTable
          etiqueta="Inventario del club"
          columnas={columnasInventario}
          filas={c.catalog}
          clave={(x) => x.id}
          alHacerClic={(x) => c.openDetails(x.id)}
        />
        <p className="note">
          Las cantidades “en robots” salen de la versión actual de cada robot del armador.
        </p>
      </Card>
    </section>
  );
}
