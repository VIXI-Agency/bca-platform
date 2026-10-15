# Refactor `admin/time/page.tsx`: lista de tareas

Base: `main` @ `74886f6`. Detalle, decisiones y riesgos en `tasks/plan.md`.

**Comandos de verificación (todas las tareas):**
- `pnpm build` (exit 0) · `pnpm test` (191+ en verde) · `npx eslint <archivos tocados>` (sin reglas nuevas violadas)
- `node tasks/verify-moved-lines.mjs` (sale sin diferencias, salvo las declaradas en la tarea)
- Snapshot de caracterización idéntico (`pnpm test` lo incluye desde T1; **nunca** correr con `-u` durante el refactor)
- `node tasks/count-print-css.mjs` después del build (mismos números que la línea base)

---

## Fase 0: red de seguridad

### Task 1: Snapshot de caracterización + script de movimiento + línea base de CSS de impresión ✅
**Descripción:** Antes de mover nada, crear las tres redes que prueban que no cambia el comportamiento:
- (a) Test `src/app/(dashboard)/admin/time/page.characterization.test.ts`: `renderToStaticMarkup` de `AdminTimePage`, con `next-auth`, los hooks de `use-admin-time` y `Tabs` simulados para pintar las 5 pestañas, y datos fijos de 3 empleados en estados distintos. Se compara contra un snapshot.
- (b) `tasks/verify-moved-lines.mjs`: compara el multiconjunto de líneas del `page.tsx` base contra la unión de los archivos nuevos, ignorando imports, `'use client'` y el prefijo `export`.
- (c) Anotar en este archivo cuántas reglas `@media print` tiene el CSS compilado.

**Aceptación:**
- [x] El snapshot se genera y pasa sin cambios en `page.tsx` (6 snapshots: 5 pestañas + encabezado; 7 tests).
- [x] El script corre sobre `page.tsx` contra sí mismo y reporta 0 diferencias (2,122 líneas).
- [x] Conteo base de CSS de impresión anotado abajo.
- [x] Prueba de que las redes detectan cambios: alterar una clase visible hace fallar el script **y** el snapshot; alterar un `print:` de la tabla del reporte (no se renderiza sin empleado) lo detecta el script.

**Verificación:** `pnpm test` (nuevo test en verde) · `node tasks/verify-moved-lines.mjs` · `pnpm build`.
**Dependencias:** ninguna.
**Archivos:** `src/app/(dashboard)/admin/time/page.characterization.test.ts`, `tasks/verify-moved-lines.mjs`, `vitest.config.ts` (solo si el include necesita el nuevo test).
**Tamaño:** S.

> **Línea base (`node tasks/count-print-css.mjs`, build de `main` @ `74886f6`):**
> `print:` utilities **33** · `@media print` blocks **2** · `.print-area` **4** · `.no-print` **1** · `.print-only` **2**
> Cada checkpoint debe dar exactamente estos números.

---

## Fase 1: base compartida

### Task 2: Extraer helpers puros y constantes a `_lib/` ✅
**Descripción:** Mover a `admin/time/_lib/format.ts` las funciones `formatTime`, `breakMinutes`, `elapsedMinutes`, `formatDuration` y `formatMinutes`. Mover a `admin/time/_lib/constants.ts` `STATUS_CONFIG`, `EDITABLE_FIELDS`, `fieldLabel`, `DISCONNECTION_TYPE_OPTIONS` y `DISCONNECTION_TYPE_LABELS`. Agregar tests unitarios de los formatters. `page.tsx` los importa.

**Aceptación:**
- [x] Los cuerpos de las funciones son idénticos (chequeo de movimiento sin diferencias: 2,122 líneas).
- [x] `format.test.ts` cubre `formatTime` (ISO y HH:mm), `breakMinutes` (incl. medianoche), `formatDuration` (null, negativos) y `formatMinutes` (16 tests; también `elapsedMinutes`).
- [x] Snapshot de T1 sin cambios. Lint igual a la línea base (9). CSS de impresión igual a la línea base.

**Verificación:** comandos comunes.
**Dependencias:** T1.
**Archivos:** `_lib/format.ts`, `_lib/format.test.ts`, `_lib/constants.ts`, `page.tsx`.
**Tamaño:** S.

### Task 3: Extraer componentes compartidos a `_components/` ✅
**Descripción:** Mover sin cambios `LockedPeriodNotice`, `StatusBadge`, `LiveTimer`, `TimeCell` + `BreakCell` (a `time-cells.tsx`) y `AuditTable`, cada uno con `'use client'`. `page.tsx` los importa.

**Aceptación:**
- [x] Chequeo de movimiento sin diferencias (2,122 líneas en 8 archivos).
- [x] Snapshot sin cambios (207 tests en verde).
- [x] Ningún archivo nuevo pasa de ~120 líneas (el mayor, `audit-table.tsx`, tiene 108). `page.tsx`: 2,333 → 1,968 líneas.
- [x] Build OK; CSS de impresión igual a la línea base (33 · 2 · 4 · 1 · 2); lint igual a la línea base (9).

> Nota: el banner de comentario `Sub-components` sigue en `page.tsx` porque el chequeo de movimiento exige conservar cada línea. Se quita en T12 como diferencia declarada.

**Verificación:** comandos comunes + conteo de `@media print` igual a la línea base.
**Dependencias:** T2.
**Archivos:** `_components/locked-period-notice.tsx`, `status-badge.tsx`, `live-timer.tsx`, `time-cells.tsx`, `audit-table.tsx`, `page.tsx`.
**Tamaño:** M.

### Checkpoint A: después de T1–T3 (PR 1)
- [ ] Build, tests, lint, snapshot y chequeo de movimiento en verde.
- [ ] Conteo de `@media print` igual a la línea base.
- [ ] PR abierto, revisado y mergeado; deploy OK.
- [ ] Revisión rápida de las 5 pestañas en producción.

---

## Fase 2: una pestaña por tarea (mover tal cual)

### Task 4: Mover `EmployeeStatusTab` a `_components/employee-status-tab.tsx` ✅
**Aceptación:** chequeo de movimiento sin diferencias · snapshot sin cambios · `page.tsx` solo la importa.
**Resultado:** sin diferencias (9 archivos) · 207 tests · build OK · `print:` 33 · lint 9 (línea base).
**Verificación:** comandos comunes.
**Dependencias:** T3. **Archivos:** `employee-status-tab.tsx`, `page.tsx`. **Tamaño:** S.

### Task 5: Mover `TimeHistoryTab` a `_components/time-history-tab.tsx`
**Aceptación:** chequeo de movimiento sin diferencias · snapshot sin cambios.
**Verificación:** comandos comunes.
**Dependencias:** T3. **Archivos:** `time-history-tab.tsx`, `page.tsx`. **Tamaño:** S.

### Task 6: Mover `AuditLogTab` a `_components/audit-log-tab.tsx`
**Aceptación:** chequeo de movimiento sin diferencias · snapshot sin cambios.
**Verificación:** comandos comunes.
**Dependencias:** T3. **Archivos:** `audit-log-tab.tsx`, `page.tsx`. **Tamaño:** S.

### Task 7: Mover `EditTimeTab` a `_components/edit-time-tab.tsx`
**Aceptación:** chequeo de movimiento sin diferencias · snapshot sin cambios.
**Verificación:** comandos comunes.
**Dependencias:** T3. **Archivos:** `edit-time-tab.tsx`, `page.tsx`. **Tamaño:** S (un archivo grande, pero es un movimiento mecánico).

### Task 8: Mover `PaymentReportTab` a `_components/payment-report/payment-report-tab.tsx`
**Descripción:** Movimiento tal cual, incluyendo `BONUS_FIELD_LABELS` y `formatCurrency` locales; los duplicados se quitan en T12. Es la pestaña con toda la lógica de impresión.

**Aceptación:**
- [ ] Chequeo de movimiento sin diferencias; en particular, las 67 líneas `print:` y las 8 `print-area`/`no-print`/`print-only` están presentes y sin cambios.
- [ ] Snapshot sin cambios.
- [ ] `page.tsx` queda solo con el guard de rol y las `Tabs` (~80 líneas).

**Verificación:** comandos comunes + conteo de `@media print` igual a la línea base.
**Dependencias:** T3. **Archivos:** `payment-report/payment-report-tab.tsx`, `page.tsx`. **Tamaño:** S.

### Checkpoint B: después de T4–T8 (PR 2)
- [ ] Todo en verde, `page.tsx` ≈ 80 líneas.
- [ ] Deploy OK.
- [ ] Revisión manual en producción (solo lectura): las 5 pestañas cargan; Edit Time y Payment Report muestran a un empleado con datos.
- [ ] **Carlos genera un PDF del Payment Report y confirma: una hoja horizontal, igual que antes.**

---

## Fase 3: dividir las pestañas grandes (cambio de estructura, mismo comportamiento)

### Task 9: Dividir `PaymentReportTab` (~540 líneas)
**Descripción:**
- Extraer los cálculos (pago regular, OT, bonos, total, `rateIsDirty`) a un hook o función pura `usePaymentReportTotals`/`computeReportTotals`.
- Extraer los subcomponentes `RateEditor`, `BonusEditor`, `ReportTable`, `DisconnectionsSummary` y `PaymentSummary`, cada uno con sus props.
- El estado se queda en `PaymentReportTab`.

**Aceptación:**
- [ ] `computeReportTotals` tiene tests y da exactamente lo mismo que `computePayStatement` para los mismos datos: redondeo, OT sin tarifa y bonos.
- [ ] Cada archivo resultante tiene menos de ~200 líneas.
- [ ] Las clases `print:` de cada subcomponente son las mismas del original (comparación por archivo con el script).

**Verificación:** comandos comunes + conteo de `@media print` igual a la línea base.
**Dependencias:** Checkpoint B. **Archivos:** `payment-report/*` (4–6 archivos). **Tamaño:** M.

### Task 10: Dividir `EditTimeTab` (~552 líneas)
**Descripción:** Extraer `TimesheetTable` y `EditTimeDialog`; el estado y las mutaciones se quedan en `EditTimeTab`.
**Aceptación:** archivos de menos de ~250 líneas · snapshot sin cambios · editar una hora funciona igual (revisión manual en el Checkpoint C).
**Verificación:** comandos comunes.
**Dependencias:** Checkpoint B. **Archivos:** `edit-time/*` (3 archivos). **Tamaño:** M.

### Task 11: Dividir `EmployeeStatusTab` (~357 líneas)
**Descripción:** Extraer `EmployeeStatusTable` y `DisconnectDialog`.
**Aceptación:** archivos de menos de ~200 líneas · snapshot sin cambios.
**Verificación:** comandos comunes.
**Dependencias:** Checkpoint B. **Archivos:** `employee-status/*` (3 archivos). **Tamaño:** M.

### Checkpoint C: después de T9–T11 (PR 3)
- [ ] Todo en verde; ningún archivo de `admin/time/` pasa de ~250 líneas.
- [ ] Deploy OK.
- [ ] Revisión manual en producción: Employee Status (abrir y cancelar el diálogo de desconexión), Edit Time (abrir y cancelar el diálogo de edición), Payment Report completo.
- [ ] **Carlos confirma el PDF del Payment Report: una hoja horizontal.**

---

## Fase 4: duplicados y código muerto

### Task 12: Quitar duplicados e imports muertos
**Descripción:**
- `formatCurrency` local (en Payment Report **y** en `admin/payroll/page.tsx`) → `@/lib/utils`.
- `BONUS_FIELD_LABELS` → `@/lib/payroll/constants`.
- `BONUS_FIELDS`/`BonusFieldKey` en `hooks/use-admin-time.ts` → re-exportar desde `@/lib/payroll/constants`.
- Alias `generateWeekOptions` → `payPeriodOptions`.
- Quitar el `useCallback` sin uso y `empLoading`.

**Aceptación:**
- [ ] `grep` confirma una sola definición de `formatCurrency`, `BONUS_FIELD_LABELS` y `BONUS_FIELDS` en `src/`.
- [ ] Snapshot sin cambios.
- [ ] Las advertencias de lint de esos archivos bajan.

**Verificación:** comandos comunes.
**Dependencias:** Checkpoint C. **Archivos:** `payment-report-tab.tsx` (o su hook), `admin/payroll/page.tsx`, `hooks/use-admin-time.ts`, pestañas que usan `generateWeekOptions`. **Tamaño:** M.

### Checkpoint final (PR 4)
- [ ] Todo en verde; deploy OK; revisión rápida de las 5 pestañas y de Payroll.
- [ ] `tasks/verify-moved-lines.mjs` y el snapshot se conservan o se borran según decidas.
- [ ] Seguimiento: abrir el PR de bugs de UI listados en `tasks/plan.md`.
