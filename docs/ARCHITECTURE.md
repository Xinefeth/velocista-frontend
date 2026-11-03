# Arquitectura — velocista-frontend

Consola del velocista (SPA React 18 + TypeScript + Vite). Repositorio separado del
backend (`velocista-backend`). Regla general del proyecto: **todo el código en inglés**;
solo comentarios, docstrings y los textos que ve el usuario quedan en español.

## Decisión: Clean Architecture (por capas)

Se adopta **Clean Architecture** y no MVC. MVC es un patrón de backend/server-rendered;
en React la vista y el controlador se mezclan y las fronteras quedan borrosas. Clean
encaja con React, hace el dominio testeable sin montar la UI y es coherente con el
backend (que también es Clean).

**Regla de dependencia (única e innegociable):** las dependencias apuntan **hacia el
dominio**. `domain/` no importa nada de las demás capas; `ui`, `application` e
`infrastructure` dependen del dominio, nunca al revés.

```
ui  →  application  →  domain  ←  infrastructure
                         ↑
                       shared
```

## Capas (carpetas en `src/`)

| Carpeta | Responsabilidad | No puede importar de |
|---|---|---|
| `domain/` | Lógica pura de negocio: reglas, simulador, formato, estado del robot, regleta, canvas. Sin React ni I/O. | `ui`, `application`, `infrastructure` |
| `domain/models/` | Entidades y tipos de negocio (robot, versión, piezas, corridas). | idem |
| `application/` | Orquestación: `hooks/` (casos de uso de la UI) y `state/` (contexts). | `ui` |
| `infrastructure/` | Adaptadores al exterior: `http/` (REST), `realtime/` (WebSocket), `persistence/` (localStorage), `contracts/` (DTOs del cable). | `ui`, `application` |
| `ui/` | Presentación React: `components/`, `pages/`, `styles/`. | — |
| `shared/` | Transversal: `data/` (catálogo/reglamento estáticos), utilidades. | `ui`, `application`, `infrastructure` |
| `app/` | Arranque: `App.tsx`, providers, layout raíz. | — |

### Alias de imports

Los imports usan el alias `@/` → `src/` (configurado en `tsconfig.json` y
`vite.config.ts`). Así mover un archivo no rompe rutas y se lee la capa de un vistazo:

```ts
import { fmt } from "@/domain/format";
import { useConsole } from "@/application/state/ConsoleContext";
```

## Estrategia de pruebas (separadas por tipo)

Las pruebas van en `tests/`, **separadas por tipo** (igual que el backend). Hoy las
carpetas están vacías: las pruebas las escribirá el equipo más adelante.

| Carpeta | Qué prueba | Herramienta sugerida |
|---|---|---|
| `tests/unit/` | Funciones puras de `domain/` (reglas, formato, simulador) | Vitest |
| `tests/black-box/` | Un componente/página por su interfaz pública (sin mirar su interior) | Vitest + Testing Library |
| `tests/integration/` | Varias piezas juntas: hook + state + `http` con API simulada | Vitest + MSW |
| `tests/e2e/` | Flujo completo en navegador (consola + backend arriba) | Playwright (a decidir) |

## Trazador de pistas (EN-28)

Vista de la consola para dibujar, verificar y guardar pistas. Sigue las mismas capas:

- `domain/track/`: geometría, 13 reglas, plantillas, transformaciones, medidas, simulación, importación del prototipo v2. Solo importa de sí mismo.
- `application/`: almacén del editor (`trackEditorStore`), simulación (`trackSimulation`), proveedor React y los hooks `useTracks`, `useTrackProfiles`, `useTrackDraft`, `useTrackExport`, `useTrackImport`.
- `infrastructure/`: `http/tracks.ts` (traduce el contrato a `Track`), borrador local (`persistence/trackDraft.ts`) y descarga de archivos (`download/saveBlob.ts`).
- `ui/components/track/` y `ui/pages/TrackTracer.tsx`: lienzo, barras, inspector, menú contextual, panel de verificación, barra de simulación, exportaciones (SVG, PNG, JSON) e importación. No importan de `@/infrastructure` (lo comprueba `tests/unit/track/layering.test.ts`).

Paleta: solo los tokens de la consola más tres `--track-*` en `ui/styles/track.css`; `tests/unit/track/palette-guard.test.ts` falla si aparece un color literal. El PNG usa la paleta oscura de la consola (pregunta abierta 15) y «SVG con cotas» **no** existe hasta que lo confirme el PO (pregunta abierta 3).

Pruebas del Trazador: `tests/unit/track/` (dominio, controlador, almacén, cotas, simulación, importación y PNG), `tests/unit/track-draft.test.ts`, `tests/black-box/pages/track-*.test.tsx` (vista completa con API y lienzo simulados) y `tests/integration/qa-live-tracks.test.ts` (opt-in con `RUN_LIVE_QA=1`).

## Política de idioma y contrato (migración por fases)

- **Hecho:** estructura Clean, nombres de carpeta y archivo en inglés, imports con alias,
  app compilando (`npm run build` en verde).
- **Pendiente (fase coordinada):** traducir los **campos del contrato** (REST + WebSocket)
  a inglés. Esos nombres son la frontera con el backend: solo se cambian **en lockstep**
  con `velocista-backend`, usando el glosario compartido (`velocista-backend/docs/CONTRACT.md`).
  Hasta entonces, los tipos de `infrastructure/contracts/` se mantienen con los nombres
  actuales (español) para no romper la app al conectar con la API.
- **Pendiente:** traducir identificadores internos restantes en español.
