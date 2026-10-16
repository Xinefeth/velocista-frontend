# Pruebas

Separadas por tipo (ver `docs/ARCHITECTURE.md`). Carpetas vacías a propósito:
las pruebas las escribe el equipo más adelante.

- `unit/`        → funciones puras de `domain/` (Vitest)
- `black-box/`   → componentes por su interfaz pública (Vitest + Testing Library)
- `integration/` → hook + state + http con API simulada (Vitest + MSW)
- `e2e/`         → flujo completo en navegador (Playwright, a decidir)
