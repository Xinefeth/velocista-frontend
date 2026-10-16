// Modal para registrar un componente, manual (HU-02) o desde enlace (HU-05). Del prototipo.
// Los campos se dibujan con los componentes comunes de gestión (EN-06) y se validan con validarCampos.
import { useEffect, useMemo, useState } from "react";
import { useConsole } from "@/application/state/ConsoleContext";
import { Close, ICO } from "@/ui/components/UiIcons";
import { TIPOS } from "@/shared/data/componentTypes";
import type { Specs } from "@/domain/models/domain";
import { PbiChip } from "@/ui/components/Card";
import { nextComponentId } from "@/domain/rules";
import {
  DynamicForm,
  Tabs,
  normalizeText,
  parseNumber,
  validateFields,
  type FieldDef,
  type Valores,
} from "@/ui/components/management/index";

const CAMPOS_BASICOS: FieldDef[] = [
  {
    nombre: "tipo",
    etiqueta: "Tipo",
    tipo: "select",
    opciones: Object.entries(TIPOS).map(([k, v]) => ({ valor: k, etiqueta: v.name })),
  },
  {
    nombre: "nombre",
    etiqueta: "Nombre",
    tipo: "text",
    requerido: true,
    marcador: "Ej. Pololu QTR-8A",
    mensajes: { obligatorio: "Escribe el nombre del componente." },
  },
];

const CAMPOS_NUMEROS: FieldDef[] = [
  {
    nombre: "precio",
    etiqueta: "Precio (S/)",
    tipo: "number",
    requerido: true,
    minExclusivo: 0,
    marcador: "0.00",
    mensajes: {
      obligatorio: "El precio debe ser mayor que 0.",
      minimo: "El precio debe ser mayor que 0.",
    },
  },
  {
    nombre: "masa",
    etiqueta: "Masa (g)",
    tipo: "number",
    requerido: true,
    min: 0,
    marcador: "0",
    mensajes: { obligatorio: "Escribe la masa en gramos." },
  },
  { nombre: "stock", etiqueta: "En el club", tipo: "number", entero: true, min: 0 },
];

const CAMPO_TIENDA: FieldDef[] = [
  { nombre: "tienda", etiqueta: "Tienda", tipo: "text", marcador: "Proveedor local (Trujillo)" },
];

const INICIAL: Valores = {
  tipo: "linea",
  nombre: "",
  precio: "",
  masa: "",
  stock: "0",
  tienda: "",
};

const PESTANAS_REGISTRO = [
  {
    id: "manual",
    etiqueta: (
      <>
        Manual <PbiChip pbi="HU-02" sprint="1" inl />
      </>
    ),
  },
  {
    id: "link",
    sprint: "2",
    etiqueta: (
      <>
        Desde enlace <PbiChip pbi="HU-05" sprint="2" inl />
      </>
    ),
  },
];

export function RegisterModal() {
  const c = useConsole();
  const [rt, setRt] = useState("manual");
  const [valores, setValores] = useState<Valores>(INICIAL);
  const [link, setLink] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState("");
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (c.regOpen) {
      setRt("manual");
      setValores(INICIAL);
      setLink("");
      setErrores({});
      setAviso("");
    }
  }, [c.regOpen]);

  const T = TIPOS[valores.tipo];
  // Los campos de especificaciones cambian según el tipo (HU-02). Son opcionales; si se llenan
  // las cifras, deben ser números válidos (unidades en la etiqueta).
  const camposSpecs = useMemo<FieldDef[]>(
    () =>
      T.fields.map(([k, etiqueta, ty]) => ({
        nombre: `spec_${k}`,
        etiqueta,
        tipo: ty === "n" ? "number" : "text",
        min: ty === "n" ? 0 : undefined,
      })),
    [T],
  );

  const cambiar = (nombre: string, valor: string) => {
    if (nombre === "tipo") {
      // Al cambiar de tipo se limpian las especificaciones del tipo anterior.
      setValores((v) => {
        const resto = Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith("spec_")));
        return { ...resto, tipo: valor };
      });
      setErrores((e) =>
        Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith("spec_"))),
      );
      return;
    }
    setValores((v) => ({ ...v, [nombre]: valor }));
    setErrores((e) => {
      if (!e[nombre]) return e;
      return Object.fromEntries(Object.entries(e).filter(([k]) => k !== nombre));
    });
  };

  const specVals = (): Specs => {
    const o: Specs = {};
    T.fields.forEach(([k, , ty]) => {
      const raw = valores[`spec_${k}`] ?? "";
      const n = ty === "n" ? parseNumber(raw) : null;
      o[k] = n !== null ? n : raw;
    });
    return o;
  };
  const cap = T.capability ? (
    <>
      {ICO.cap}
      <span>
        Aporta a la consola: <b>{T.capability(specVals())}</b>
      </span>
    </>
  ) : (
    <>
      {ICO.info}
      <span>Este tipo no agrega paneles a la consola.</span>
    </>
  );

  const extraer = () => {
    setFetching(true);
    setLink((l) => l || "https://tienda.ejemplo/producto/qtr-hd-15a");
    setTimeout(() => {
      setFetching(false);
      setValores({
        tipo: "linea",
        nombre: "Pololu QTR-HD-15A",
        precio: "71.50",
        masa: "2",
        stock: "0",
        tienda: "Importación",
        spec_canales: "15",
        spec_salida: "Analógica",
        spec_paso: "4",
        spec_i: "0.1",
      });
      setErrores({});
      c.showToast("Datos extraídos: revísalos antes de guardar.");
    }, 900);
  };

  const guardar = () => {
    const nuevos = validateFields(
      [...CAMPOS_BASICOS, ...CAMPOS_NUMEROS, ...CAMPO_TIENDA, ...camposSpecs],
      valores,
    );
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) {
      setAviso("Revisa los campos marcados antes de guardar.");
      return;
    }
    const nm = valores.nombre.trim();
    // Un mismo componente no se registra dos veces: evita duplicar el catálogo y el inventario.
    if (
      c.catalog.some(
        (x) => x.typeId === valores.tipo && normalizeText(x.name) === normalizeText(nm),
      )
    ) {
      setErrores({ nombre: "Ya existe un componente con ese nombre en este tipo." });
      setAviso("Revisa los campos marcados antes de guardar.");
      return;
    }
    const s = specVals();
    if (c.apiMode) {
      // Solo las specs llenas; la API rechaza cadenas vacías en campos numéricos.
      const espec: Specs = {};
      for (const [k, v] of Object.entries(s)) {
        if (v !== "" && v !== null && v !== undefined) espec[k] = v;
      }
      void c.createComponent({
        typeId: valores.tipo,
        name: nm,
        price: parseNumber(valores.precio) ?? 0,
        mass: parseNumber(valores.masa) ?? 0,
        store: valores.tienda.trim() || "—",
        amps: typeof espec.i === "number" ? espec.i : undefined,
        specs: espec,
        stock: parseNumber(valores.stock) ?? 0,
      });
      c.closeRegistration();
      return;
    }
    const id = nextComponentId(c.catalog);
    c.setCatalog((list) => [
      ...list,
      {
        id,
        typeId: valores.tipo,
        name: nm,
        price: parseNumber(valores.precio) ?? 0,
        mass: parseNumber(valores.masa) ?? 0,
        store: valores.tienda.trim() || "—",
        stock: parseNumber(valores.stock) ?? 0,
        specs: s,
        amps: Number(s.i) || 0,
      },
    ]);
    c.closeRegistration();
    c.log("Catálogo", `Registrado: ${nm}`, "good");
    c.showToast(`${nm} quedó en el catálogo.`);
  };

  if (!c.regOpen)
    return (
      <div className="modal" role="dialog" aria-hidden="true" aria-label="Registrar componente" />
    );

  return (
    <div className="modal on" role="dialog" aria-modal="true" aria-label="Registrar componente">
      <div className="dh">
        <div>
          <span className="lbl">Catálogo</span>
          <h3>Registrar componente</h3>
        </div>
        <button type="button" className="x" aria-label="Cerrar" onClick={c.closeRegistration}>
          <Close />
        </button>
      </div>
      <div className="mb">
        <Tabs
          pestanas={PESTANAS_REGISTRO}
          activa={rt}
          alCambiar={setRt}
          etiqueta="Forma de registro"
          style={{ margin: 0 }}
        />
        {rt === "link" && (
          <div>
            <div className="fld">
              <span className="lbl">Enlace de la tienda</span>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="inp"
                  placeholder="https://…/producto/qtr-8a"
                  aria-label="Enlace de la tienda"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                />
                <button type="button" className="sb" onClick={extraer}>
                  {fetching ? "Extrayendo…" : "Extraer datos"}
                </button>
              </div>
            </div>
            <p className="note">
              Se extraen nombre, precio y especificaciones; revisa los datos antes de guardar.
            </p>
          </div>
        )}
        <DynamicForm
          campos={CAMPOS_BASICOS}
          valores={valores}
          errores={errores}
          alCambiar={cambiar}
          columnas={2}
        />
        <DynamicForm
          campos={CAMPOS_NUMEROS}
          valores={valores}
          errores={errores}
          alCambiar={cambiar}
          columnas={3}
        />
        <DynamicForm
          campos={CAMPO_TIENDA}
          valores={valores}
          errores={errores}
          alCambiar={cambiar}
          columnas={1}
        />
        <div className="sub">Especificaciones del tipo</div>
        <DynamicForm
          campos={camposSpecs}
          valores={valores}
          errores={errores}
          alCambiar={cambiar}
          columnas={2}
        />
        <div className="cap">{cap}</div>
        <p className="hint warn" role="status">
          {aviso}
        </p>
      </div>
      <div className="mf">
        <button type="button" className="sb ghost" onClick={c.closeRegistration}>
          Cancelar
        </button>
        <button type="button" className="sb red" onClick={guardar}>
          Guardar en el catálogo
        </button>
      </div>
    </div>
  );
}
