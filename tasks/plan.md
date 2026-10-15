# Plan: refactor de `admin/time/page.tsx` sin cambiar comportamiento

## Resumen
`src/app/(dashboard)/admin/time/page.tsx` tiene **2,333 líneas** con 5 pestañas, helpers, constantes y 7 subcomponentes en un solo archivo. La regla del proyecto es menos de ~200 líneas por componente. El objetivo es dividirlo en módulos pequeños **sin cambiar ningún comportamiento ni el resultado impreso**: el Payment Report se imprime a PDF en una sola hoja horizontal, y esa salida depende de 67 líneas con clases `print:` y 8 con `print-area`/`no-print`/`print-only`.

**Fuera de alcance, a propósito:** cualquier arreglo de bugs. Los bugs conocidos de la UI quedan en "Seguimiento" y se corrigen en un PR aparte *después* del refactor. Un refactor que además cambia comportamiento no se puede verificar.

## Mapa actual (líneas aprox.)
| Bloque | Líneas | Tamaño |
|---|---|---|
| Imports + helpers (`formatTime`, `breakMinutes`, `elapsedMinutes`, `formatDuration`, `formatMinutes`, `LockedPeriodNotice`) | 1–148 | ~148 |
| Constantes (`STATUS_CONFIG`, `EDITABLE_FIELDS`, `fieldLabel`, `DISCONNECTION_TYPE_OPTIONS`) | 150–202 | ~53 |
| `StatusBadge`, `LiveTimer` | 208–247 | ~40 |
| `AdminTimePage` (guard + tabs) | 252–322 | ~70 |
| `EmployeeStatusTab` | 328–684 | **~357** |
| `EditTimeTab` | 688–1240 | **~552** |
| `TimeCell`, `BreakCell` | 1244–1336 | ~92 |
| `TimeHistoryTab` | 1340–1540 | ~200 |
| `AuditLogTab` | 1544–1666 | ~122 |
| `DISCONNECTION_TYPE_LABELS`, `BONUS_FIELD_LABELS`, `formatCurrency` | 1670–1691 | ~22 |
| `PaymentReportTab` | 1693–2233 | **~540** |
| `AuditTable` (usada por Edit Time, Audit Log y Payment Report) | 2237–2333 | ~96 |

## Grafo de dependencias
```
_lib/format.ts  (formatTime, breakMinutes, elapsedMinutes, formatDuration, formatMinutes)
_lib/constants.ts (STATUS_CONFIG, EDITABLE_FIELDS, fieldLabel, DISCONNECTION_TYPE_OPTIONS/LABELS)
        │
        ├── _components/locked-period-notice.tsx ──┐
        ├── _components/status-badge.tsx ─────────┤
        ├── _components/live-timer.tsx ───────────┤
        ├── _components/time-cells.tsx (TimeCell, BreakCell)
        └── _components/audit-table.tsx ──────────┤
                                                  │
   _components/employee-status-tab.tsx  ← StatusBadge, LiveTimer, constants, format
   _components/edit-time-tab.tsx        ← TimeCell/BreakCell, AuditTable, LockedPeriodNotice, constants, format
   _components/time-history-tab.tsx     ← format
   _components/audit-log-tab.tsx        ← AuditTable
   _components/payment-report/*         ← AuditTable, LockedPeriodNotice, format, @/lib/payroll/constants
        │
   page.tsx (solo guard de rol + Tabs que importan las 5 pestañas)
```
El orden de implementación va de abajo hacia arriba: primero helpers y componentes compartidos, luego cada pestaña.

## Decisiones de arquitectura
- **Colocar junto a la ruta, en carpetas privadas de Next.js:** `admin/time/_lib/` y `admin/time/_components/`. El `_` evita que se vuelvan rutas, y todo queda en la feature que lo usa (no en `src/components` global).
- **Fases 1–2: mover, no reescribir.** Cada pestaña se mueve *tal cual* (mismo JSX, mismas clases, mismo estado), solo agregando `export` e imports. Lo garantiza un chequeo mecánico (ver Verificación).
- **Fase 3 aparte: dividir las pestañas grandes** (Payment Report, Edit Time, Employee Status) en subcomponentes con props. Es el único lugar donde la estructura cambia, por eso va después de que todo lo demás esté verificado.
- **Fase 4: quitar duplicados**, cada uno con su reemplazo exacto:
  - `formatCurrency` → ya existe idéntico en `src/lib/utils.ts`.
  - `BONUS_FIELD_LABELS` → `@/lib/payroll/constants`.
  - `BONUS_FIELDS`/`BonusFieldKey` duplicados en `hooks/use-admin-time.ts` → `@/lib/payroll/constants`.
  - Alias `generateWeekOptions` → `payPeriodOptions`.
  - Imports y variables muertas que reporta el lint (`useCallback`, `empLoading`).
- **`DISCONNECTION_TYPE_OPTIONS` ("Absence") y `DISCONNECTION_TYPE_LABELS` ("Absences") NO se unifican.** Los textos difieren a propósito (dropdown singular y conteo plural); unificarlos cambiaría lo que se ve.
- **Cada archivo de componente lleva `'use client'`;** `_lib/*` queda puro (sin directiva).
- **Un PR por fase**, cada uno desplegable por sí solo. Las tareas dentro de una fase son commits.

## Verificación (aplica a cada tarea)
1. **Chequeo de movimiento** (fases 1, 2 y 4): un script compara las líneas del `page.tsx` original (`git show <base>:…`) con la unión de los archivos nuevos. Ignora imports, la directiva `'use client'` y el prefijo `export`. **Debe salir sin diferencias**, salvo las que la tarea declara. Esto prueba que no cambió ni una clase `print:`.
2. **Snapshot de caracterización** (se crea en la Tarea 1, antes de mover nada): render a HTML estático de `AdminTimePage` con los hooks simulados y `Tabs` simulado para que pinte las 5 pestañas. Cubre el estado inicial de todas las pestañas y la tabla completa de Employee Status. Debe quedar idéntico en todas las tareas de las fases 1, 2 y 4.
3. **CSS de impresión:** el número de reglas `@media print` en el CSS compilado (`.next/static/css`) debe ser igual antes y después. Esto confirma que Tailwind sigue detectando las clases `print:` en los archivos nuevos.
4. `pnpm build` (exit 0), `pnpm test` (184+ en verde) y `eslint` sobre los archivos tocados sin reglas nuevas violadas. El `react-hooks/set-state-in-effect` ya existía antes del refactor.
5. **Revisión manual** al cierre de cada fase: abrir las 5 pestañas en producción tras el deploy, solo lectura. **Tú** generas un PDF del Payment Report y confirmas que sigue saliendo en una hoja. El diálogo de impresión congela la automatización del navegador, así que no lo puedo hacer yo.

## Lista de tareas
Ver `tasks/todo.md` (es la fuente de verdad del avance).

- **Fase 0, red de seguridad:** T1
- **Fase 1, base compartida:** T2, T3 → Checkpoint A (PR 1)
- **Fase 2, una pestaña por tarea:** T4 Employee Status, T5 Time History, T6 Audit Log, T7 Edit Time, T8 Payment Report → Checkpoint B (PR 2, deploy y revisión manual + PDF)
- **Fase 3, dividir pestañas grandes:** T9 Payment Report, T10 Edit Time, T11 Employee Status → Checkpoint C (PR 3, deploy y revisión manual + PDF)
- **Fase 4, duplicados y código muerto:** T12 → Checkpoint final (PR 4)

## Riesgos y mitigación
| Riesgo | Impacto | Mitigación |
|---|---|---|
| Un error al copiar cambia una clase o una condición | Alto (PDF o cálculo de pago) | Chequeo mecánico de movimiento + snapshot + build en cada tarea |
| Tailwind no detecta clases `print:` en archivos nuevos y el PDF se rompe | Alto | Comparar el conteo de reglas `@media print` en el CSS compilado; revisión del PDF en cada checkpoint |
| Fase 3 cambia comportamiento al pasar estado por props | Medio | Va al final, en su propio PR; el snapshot cubre el estado inicial y la revisión manual cubre el resto |
| Alguien edita `page.tsx` en paralelo y hay conflictos | Medio | Fases cortas, mergear cada PR en cuanto pase su checkpoint |
| El snapshot solo cubre el estado inicial (el Payment Report requiere elegir un empleado) | Medio | El chequeo de movimiento es la garantía principal para el JSX que no se renderiza en el snapshot |
| Que `next build` rechace exports extra en `page.tsx` | Bajo | Los componentes se exportan desde `_components/`, no desde `page.tsx` |

## Seguimiento (después del refactor, en PR aparte)
Bugs que encontró la revisión de UI. **No** se tocan en este refactor:
- Audit Log: "All Employees" nunca muestra nada (`parseInt('all')` da NaN).
- Payment Report: al cambiar de pestaña se pierde el empleado elegido, la tarifa escrita y los bonos.
- Mientras se guardan los bonos, el refetch puede sobrescribir lo que se está escribiendo.
- Las horas se redondean por día y luego a minutos al mostrarlas, así que el total de la semana puede diferir del total mostrado por 1–2 min.

## Preguntas abiertas
1. ¿Un PR por fase (4 PRs) te parece bien, o prefieres un solo PR al final?
2. Revisión manual: ¿la hago yo en producción tras cada deploy con tu sesión ya abierta en Chrome, solo lectura, y tú solo pruebas el PDF?
3. ¿Confirmas que los bugs de "Seguimiento" van en un PR posterior y no dentro de este refactor?
