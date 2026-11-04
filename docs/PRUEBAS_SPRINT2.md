# Pruebas del frontend — Sprint 2 (EN-39, EN-40)

Pruebas de las vistas de Medición de la consola (Odometría, Áreas y planos, Precisión del GPS,
modelo y Mapa de pista) y de la página del celular (`/celular.html`), hechas en React con Vite.

| Tipo | Dónde | Qué cubre |
|---|---|---|
| Unitarias | `tests/unit/measurement/` | Textos y semáforo, proyección de los lienzos, plano del lugar y recomendaciones, contador de pasos, GPS de una persona quieta, giro, esquina automática y validación de formularios |
| Integración | `tests/integration/measurement/` | Cliente REST contra la API (rutas, métodos, cuerpos, token y errores) y una medición completa del celular con sensores simulados: crear, enviar lecturas en lotes, terminar y ver el resultado |
| Caja negra | `tests/black-box/measurement/` | Cada vista con la API simulada: datos válidos, entradas inválidas (números, campos vacíos, menos de 2 mediciones, escala 0), lista vacía y error del backend |
| End-to-end | `tests/e2e/flows/casos-de-uso.e2e.ts` | Los 5 casos del profesor en Chromium (CU-1 a CU-5) y la página del celular, con evidencia en `docs/evidencias/e2e-sprint2/` |

## Casos end-to-end

| Caso | Qué se hace | Evidencia |
|---|---|---|
| CU-1 | Plano a escala 1:50 de 16 × 12 cm, calibración del celular y resultado frente al plano | [CU-1](evidencias/e2e-sprint2/CU-1.png) |
| CU-1 (inválido) | «Otro» lugar sin nombre no deja avanzar | — |
| CU-2 | Pista del Trazador frente a la vuelta medida (largo, área, cierre y giro sobrante) | [CU-2](evidencias/e2e-sprint2/CU-2.png) |
| CU-3 | Área de un rectángulo y de una acera en L (cóncava) por puntos; punto sin «y» rechazado | [CU-3](evidencias/e2e-sprint2/CU-3.png) |
| CU-4 | Error del GPS por prueba, si sirve según el lado del lugar y evaluación del modelo | [CU-4](evidencias/e2e-sprint2/CU-4.png) |
| CU-5 | Plano desde lados y ángulos con lo que falta calculado y comparado con el plano | [CU-5](evidencias/e2e-sprint2/CU-5.png) |
| CU-5 (inválido) | Demasiados datos vacíos: lo explica | — |
| Celular | Abre `/celular.html`, muestra el código, pide sensores antes de medir y preselecciona el modelo | [celular](evidencias/e2e-sprint2/celular.png) |

## Cómo se corren

```powershell
npm test                                  # unitarias, integración y caja negra (Vitest)
npx playwright test casos-de-uso          # end-to-end (levanta Vite solo)
```

En equipos con poca memoria, Vitest se corre en un solo hilo:
`npx vitest run --pool=threads --maxWorkers=1 --minWorkers=1`.

## Resultado (4 de noviembre de 2026)

- Vitest: 740 pruebas aprobadas, 0 fallidas (20 omitidas que ya existían: pruebas contra el
  backend vivo).
- Playwright: los 8 casos nuevos aprobados. `console-navigation › opens on the control page`
  ya fallaba en `main` antes de este sprint (espera la pista de calibración y aparece la del
  simulador externo); no se tocó.
- Las pruebas end-to-end encontraron un defecto que se corrigió en `feat/medicion-base`: con el
  alcance por defecto en Sprint 1, las tarjetas del Sprint 2 quedaban inertes.
