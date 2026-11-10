# Hora de entrada por usuario: tareas

Contrato: `docs/specs/clock-in-start.md`. Decisiones y riesgos: `tasks/clock-in-start/plan.md`.
Rama: `feat/clock-in-start` desde `main`.

**Verificación en todas las tareas:** `pnpm test` en verde · `npx eslint <archivos tocados>` sin errores nuevos.

---

## Fase 1: la regla

### [x] T1: Columna `ClockInStartMinutes` y schema Prisma
**Qué:** migración SQL idempotente y el campo en el modelo `User`.
**Archivos:** `prisma/migrations/20261110_users_clock_in_start.sql` (nuevo), `prisma/schema.prisma`.
**Aceptación:**
- La migración usa `IF COL_LENGTH('dbo.Users', 'ClockInStartMinutes') IS NULL` y agrega `SMALLINT NULL`; solo aditiva, con encabezado que explica el significado de `NULL`.
- `clockInStartMinutes Int? @map("ClockInStartMinutes") @db.SmallInt` en `User`, con comentario.
**Verificar:** `npx prisma validate` y `npx prisma generate` sin errores; `pnpm test` en verde.
**No hacer:** ejecutar la migración contra producción (eso es T5).
**Tamaño:** S. **Depende de:** nada.

### [x] T2: Regla de clock-in por usuario
**Qué:** módulo puro `clock-in-start.ts` y la ruta de clock-in usándolo. TDD.
**Archivos:** `src/lib/clock/clock-in-start.ts` y `.test.ts` (nuevos), `src/app/api/clock/action/route.ts`, `src/app/api/clock/action/route.test.ts`.
**Pasos:**
1. Pruebas unitarias que fallan: tabla de ejemplos del spec, límites (un segundo antes, minuto exacto, después), `NULL`/inválido/sin rol al default, `formatClockInStart`.
2. Implementar `clockInStartFor`, `recordedClockIn`, `formatClockInStart` y las constantes.
3. En `route.test.ts`, agregar casos con `clockInStartMinutes` 300 y 420 (Remote Agent y Closer) y verlos fallar.
4. En `route.ts`: `activePunchOrder` devuelve también la hora de entrada; se borra `applyEarlyClockInRule`; se actualiza el comentario de la regla de clock-out.
**Aceptación:**
- Criterios 1 a 4 del spec.
- Las pruebas que ya existían en `route.test.ts` pasan **sin haberse editado**.
- Una sola consulta al usuario por checada, como hoy.
**Verificar:** `pnpm test src/lib/clock src/app/api/clock`; `git diff` de `route.test.ts` solo muestra líneas agregadas.
**Tamaño:** M. **Depende de:** T1.

### Checkpoint A
- [x] `pnpm test` completo en verde (481).
- [x] Pruebas viejas de la regla 5:45/6:00 intactas (0 líneas borradas en `route.test.ts`).
- [ ] Carlos revisa la regla antes de seguir.

---

## Fase 2: configurarla

### [x] T3: API de usuarios lee y guarda `clockInStart`
**Qué:** validación y persistencia del campo. TDD.
**Archivos:** `src/lib/validators.ts`, `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`, `src/app/api/users/[id]/route.test.ts`.
**Aceptación:**
- `clockInStart` opcional y nullable, restringido a `CLOCK_IN_START_OPTIONS`; `null` guarda `NULL`.
- `GET /api/users` y `GET /api/users/[id]` devuelven `clockInStart` (`number | null`).
- Pruebas: admin guarda 300; `null` regresa al default; 315 y 600 dan 400; un Closer que lo envía recibe 403.
- Criterio 6 del spec.
**Verificar:** `pnpm test src/app/api/users`.
**Tamaño:** S. **Depende de:** T1, T2 (constantes).

### [ ] T4: Selector e insignia en Users (código listo; falta la prueba manual, que requiere la columna en la base)
**Qué:** el admin elige la hora en el diálogo de usuario y la ve en la lista.
**Archivos:** `src/app/(dashboard)/admin/users/_components/clock-in-start-select.tsx` (nuevo), `src/app/(dashboard)/admin/users/page.tsx`, `src/hooks/use-users.ts`.
**Aceptación:**
- Selector "Clock-in start" con 4:00 a 9:00 AM, default 6:00, nota "Pacific time. Earlier punches are recorded as this time."
- Elegir 6:00 envía `null`.
- Insignia `Starts 5:00 AM` en la lista solo cuando no es el default.
- Funciona al crear y al editar; usable en ancho de teléfono.
- Criterio 5 del spec.
**Verificar:** `pnpm build`; en local: editar un usuario, guardar, recargar y confirmar que persiste; hacer clock-in con ese usuario antes de su hora y ver la hora registrada.
**Tamaño:** M. **Depende de:** T3.

### Checkpoint B
- [ ] `pnpm test` y `pnpm build` en verde; eslint limpio en archivos tocados.
- [ ] Diff limitado a los archivos del spec.
- [ ] Revisión de código (code-reviewer).
- [ ] Aprobación de Carlos para commit y PR.

---

## Fase 3: producción (cada paso requiere aprobación)

### [ ] T5: Salida
**Pasos, en este orden:**
1. Ejecutar `20261110_users_clock_in_start.sql` contra `benjaise_BCA` y confirmar que la columna existe.
2. Desplegar a yourdebtcollectors.com.
3. Prueba de humo: abrir Users, abrir Clock, confirmar que un clock-in normal sigue funcionando.
4. Poner a Lauren Folkes (IdUser 1337) en 5:00 AM desde la pantalla.
5. Al día siguiente, revisar su clock-in registrado.
**Aceptación:** criterio de éxito del spec.
**Recordatorio:** el cambio de horario es manual. El 14 de marzo de 2027 hay que regresarla a 6:00 AM.
**Tamaño:** S. **Depende de:** Checkpoint B.
