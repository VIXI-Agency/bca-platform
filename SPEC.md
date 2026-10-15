# Spec: refactor de `admin/time/page.tsx` (sin cambio de comportamiento)

> El plan técnico está en `tasks/plan.md` y el avance en `tasks/todo.md`; este documento es el contrato. Si se contradicen, manda este SPEC y los otros dos se actualizan.

## Objetivo
`src/app/(dashboard)/admin/time/page.tsx` tiene **2,333 líneas**: 5 pestañas (Employee Status, Edit Time, Time History, Audit Log, Payment Report), helpers, constantes y 7 subcomponentes. La regla del proyecto es menos de ~200 líneas por componente. Con este tamaño, cada cambio de payroll es arriesgado y difícil de revisar.

**Qué se hace:** dividirlo en módulos pequeños por pestaña y por responsabilidad, y quitar los duplicados.

**Qué no cambia:** lo que ve el usuario, lo que calcula la página y lo que se imprime.

**Usuarios:** los administradores de PulseBC (rol 1), que la usan en producción a diario. También los desarrolladores que la mantienen.

**Éxito para el usuario:** no nota nada. El Payment Report sigue imprimiendo a PDF en **una hoja horizontal**, con los mismos números.

**Fuera de alcance:** cualquier corrección de bugs, aunque sea obvia. Los bugs conocidos están en `tasks/plan.md` → "Seguimiento" y van en un PR aparte, después del refactor.

## Tech stack (sin cambios)
- Next.js 16.1.6 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4
- TanStack Query (hooks en `src/hooks/use-admin-time.ts`), Radix UI
- Vitest 3 (`vitest.config.ts`, include `src/**/*.test.ts`, alias `@/`)
- **No se agregan dependencias.**

## Comandos
```bash
pnpm build                          # next build; exit 0
pnpm test                           # vitest run; 191+ en verde (línea base)
npx eslint <archivos tocados>       # sin reglas nuevas violadas (ver Boundaries)
node tasks/verify-moved-lines.mjs   # chequeo de movimiento contra 74886f6
node tasks/count-print-css.mjs      # tras pnpm build; debe dar la línea base
```

**Línea base del CSS de impresión** (build de `main` @ `74886f6`):

| Métrica | Valor |
|---|---|
| Utilidades `print:` | 33 |
| Bloques `@media print` | 2 |
| `.print-area` | 4 |
| `.no-print` | 1 |
| `.print-only` | 2 |

## Estructura objetivo
```
src/app/(dashboard)/admin/time/
├── page.tsx                         → guard de rol + Tabs (~80 líneas)
├── page.characterization.test.ts    → red de seguridad (T1, ya existe)
├── __snapshots__/                   → snapshot de las 5 pestañas (no regenerar)
├── _lib/
│   ├── format.ts (+ format.test.ts) → formatTime, breakMinutes, elapsedMinutes, formatDuration, formatMinutes
│   └── constants.ts                 → STATUS_CONFIG, EDITABLE_FIELDS, fieldLabel, DISCONNECTION_TYPE_OPTIONS/LABELS
└── _components/
    ├── locked-period-notice.tsx, status-badge.tsx, live-timer.tsx, time-cells.tsx, audit-table.tsx
    ├── employee-status-tab.tsx      → Fase 3: employee-status/{tab, table, disconnect-dialog}
    ├── edit-time-tab.tsx            → Fase 3: edit-time/{tab, timesheet-table, edit-time-dialog}
    ├── time-history-tab.tsx
    ├── audit-log-tab.tsx
    └── payment-report/              → Fase 3: tab + computeReportTotals + RateEditor, BonusEditor,
                                       ReportTable, DisconnectionsSummary, PaymentSummary
```
Las carpetas con `_` son privadas en Next.js y no generan rutas. Todo queda junto a la feature que lo usa, no en `src/components`.

## Estilo de código
Mismo estilo que el archivo actual. Un componente movido queda así:

```tsx
'use client';

import { Badge } from '@/components/ui/badge';
import { STATUS_CONFIG } from '../_lib/constants';

export function StatusBadge({ status }: { status: string }) {
  // cuerpo copiado sin cambios del page.tsx original
}
```

- Cada archivo de `_components/` empieza con `'use client'`. `_lib/` es TypeScript puro, sin directiva.
- **Fases 1, 2 y 4:** el cuerpo de cada función o componente se copia **literal**. Solo se agregan `export` e `import`.
- Nombres de archivo en kebab-case. Exports con nombre, salvo el `export default` de `page.tsx`, que Next.js exige.
- Las props de los subcomponentes de la Fase 3 se declaran con `interface` y nombre explícito, sin `any`.
- Los textos de `DISCONNECTION_TYPE_OPTIONS` ("Absence") y `DISCONNECTION_TYPE_LABELS` ("Absences") **no se unifican**, porque difieren a propósito.

## Estrategia de pruebas
| Red | Qué garantiza | Cuándo |
|---|---|---|
| **Chequeo de movimiento** (`verify-moved-lines.mjs`) | Ninguna línea del original cambió, incluidas las 67 `print:` y las 8 `print-area`/`no-print`/`print-only` | Fases 1, 2 y 4: sin diferencias. Fase 3: solo las diferencias que declara la tarea, y las clases `print:` comparadas archivo por archivo |
| **Snapshot de caracterización** | El HTML de las 5 pestañas y del encabezado es idéntico | Todas las tareas. **Nunca** correr con `-u` |
| **Conteo de CSS de impresión** | Tailwind sigue detectando las clases `print:` en los archivos nuevos | Cada checkpoint, contra la línea base |
| **Tests unitarios nuevos** | `format.test.ts` (T2) y `computeReportTotals` (T9). Este último debe coincidir con `computePayStatement`: redondeo, OT sin tarifa y bonos | Al crear el módulo |
| **Revisión manual** | Las 5 pestañas cargan en producción. El PDF sale en una hoja | Checkpoints B y C, y el final |

El snapshot no cubre el Payment Report con un empleado elegido. Para ese JSX la garantía principal es el chequeo de movimiento, y la revisión manual del PDF es la de respaldo.

## Fases, PRs y ramas
Hay un PR por fase, cada uno desplegable por sí solo. Cada tarea es un commit.

| PR | Tareas | Rama | Checkpoint |
|---|---|---|---|
| 1 | T1–T3: red de seguridad y base compartida | `refactor/admin-time-phase1` | A |
| 2 | T4–T8: una pestaña por tarea | `refactor/admin-time-phase2` | B: deploy, revisión manual y PDF |
| 3 | T9–T11: dividir las pestañas grandes | `refactor/admin-time-phase3` | C: deploy, revisión manual y PDF |
| 4 | T12: duplicados y código muerto | `refactor/admin-time-phase4` | Final |

Cada rama sale de `main` **después** de mergear el PR anterior. No se apilan ramas.

## Boundaries
**Siempre:**
- Correr build, tests, el chequeo de movimiento y eslint antes de cada commit.
- Hacer un commit por tarea, con el formato `refactor(time): …` y la línea `Co-Authored-By`.
- Hacer `git add` solo de los archivos de la tarea y de `tasks/todo.md`, nunca `-A`.
- Marcar la tarea en `tasks/todo.md`.
- Usar `gh … --repo VIXI-Agency/bca-platform`.

**Preguntar primero (aquí se detiene `/build auto`):**
- **Mergear un PR.** Hacer push a `main` despliega a producción vía `deploy.yml`. Al llegar a cada checkpoint abro el PR y espero tu OK.
- Cualquier diferencia del chequeo de movimiento o del snapshot que la tarea no declare.
- Cambiar código fuera de `admin/time/`. La única excepción prevista es T12: `admin/payroll/page.tsx`, `hooks/use-admin-time.ts` y `lib/payroll/constants.ts`.
- Que el build, los tests o el conteo de CSS fallen sin una causa obvia y mecánica.

**Nunca:**
- Regenerar el snapshot (`-u`) ni editarlo a mano.
- Corregir bugs, renombrar textos visibles o cambiar clases CSS dentro de este refactor.
- Tocar la base de datos, migraciones, `.env*` o secretos.
- Abrir el diálogo de impresión del navegador, porque congela la automatización. El PDF lo pruebas tú.
- Escribir en producción desde Chrome. La revisión es solo de lectura.
- Usar `--no-verify` o hacer force-push a `main`.

## Criterios de éxito
- [ ] `page.tsx` tiene ≤ ~80 líneas: solo el guard de rol y las `Tabs`.
- [ ] Ningún archivo de `admin/time/` pasa de ~250 líneas. Los subcomponentes de la Fase 3 tienen < ~200.
- [ ] El snapshot de caracterización queda idéntico al de T1 en las 4 fases.
- [ ] El chequeo de movimiento da 0 diferencias al cerrar las Fases 1 y 2. En las Fases 3 y 4 solo aparecen las diferencias declaradas.
- [ ] `count-print-css.mjs` da exactamente la línea base en cada checkpoint.
- [ ] `pnpm build` exit 0. `pnpm test` en verde con ≥ 191 tests más los nuevos.
- [ ] `grep` encuentra una sola definición de `formatCurrency`, `BONUS_FIELD_LABELS` y `BONUS_FIELDS` en `src/`.
- [ ] Hay 4 PRs mergeados y desplegados sin errores en `/logs/iisnode`.
- [ ] Revisión manual: las 5 pestañas cargan en producción tras los PRs 2, 3 y 4.
- [ ] **Carlos confirma que el PDF del Payment Report sale en una hoja horizontal tras los PRs 2 y 3.**

## Preguntas abiertas
Las tres de `tasks/plan.md` quedaron resueltas:
1. Un PR por fase.
2. Yo hago la revisión en producción, solo lectura, con tu sesión de Chrome; tú pruebas el PDF.
3. Los bugs van en un PR aparte, después del refactor.

Ninguna sigue abierta. Lo único que falta es tu aprobación de este SPEC.
