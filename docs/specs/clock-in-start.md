# Spec: hora de entrada por usuario en el reloj checador

> Plan y tareas en `tasks/clock-in-start/plan.md` y `tasks/clock-in-start/todo.md`. Este documento es el contrato; si se contradicen, manda este spec.
> El `SPEC.md` de la raíz pertenece al refactor de `admin/time` y no se toca.

## Objetivo

Hoy la hora de entrada es 6:00 AM Pacífico para todos y está escrita en el código (`src/app/api/clock/action/route.ts`). Algunos empleados necesitan entrar a otra hora. El primer caso es Lauren Folkes (Remote Agent, Kingston, Jamaica): Jamaica no cambia de horario, así que en invierno su misma hora local equivale a las 5:00 AM Pacífico.

**Qué se hace:** cada usuario tiene una hora de entrada configurable desde la pantalla Users. El clock-in se ajusta contra esa hora en lugar de contra las 6:00.

**Usuarios:** los Administrators (rol 1), que la configuran. Los empleados no ven ninguna pantalla nueva.

**Éxito:** un admin pone a Lauren en 5:00 AM, y al día siguiente su clock-in de las 5:10 se registra como 5:10. Para todos los demás no cambia nada.

## Reglas de negocio

Sea `entrada` la hora de entrada del usuario (default 6:00 AM) y `tolerancia` = 15 minutos para Administrator (1) y Closer (2), 0 para los demás roles.

| Hora real del clock-in | Hora registrada |
|---|---|
| Antes de `entrada − tolerancia` | `entrada − tolerancia` |
| Desde `entrada − tolerancia` en adelante | La hora real |

Ejemplos:

| Usuario | Entrada | Checa a las | Se registra |
|---|---|---|---|
| Remote Agent | 5:00 | 4:30 | 5:00 |
| Remote Agent | 5:00 | 5:10 | 5:10 |
| Remote Agent | 6:00 (default) | 5:40 | 6:00 |
| Remote Agent | 7:00 | 6:30 | 7:00 |
| Closer | 6:00 (default) | 5:50 | 5:50 |
| Closer | 5:00 | 4:30 | 4:45 |

Decisiones tomadas con Carlos (2026-11-10):

1. **La tolerancia de 15 minutos de Administrator y Closer se mantiene**, ahora relativa a la hora de entrada de cada quien.
2. **El cambio de horario (DST) es manual.** Un admin cambia la hora de entrada del usuario cuando cambia el horario. No hay lógica de zonas horarias por empleado.
3. **Opciones del selector:** horas en punto de 4:00 a 9:00 AM Pacífico. Default 6:00.
4. **Solo Administrators** pueden cambiarla. El endpoint ya impide que un Closer toque cualquier campo que no sea activar o desactivar.

Otras reglas:

- La hora de entrada se lee de la base de datos en cada clock-in. Un cambio aplica desde el siguiente clock-in, sin cerrar sesión.
- El rol se sigue leyendo de la sesión, como hoy.
- Solo afecta la acción `clockIn`. Breaks, lunch, orden de checadas, mínimo de 30 minutos de lunch y clock-out no cambian.
- La regla de "clock-out debe ser posterior al clock-in registrado" sigue igual y ya cubre este caso.
- No modifica registros existentes ni lo que un admin captura en Edit Time.

## Diseño

**Datos.** Una columna nueva, `dbo.Users.ClockInStartMinutes SMALLINT NULL`: minutos desde medianoche, hora Pacífico. `NULL` significa el default (360 = 6:00 AM). Se guardan minutos y no horas para poder ofrecer medias horas después sin otra migración.

**Lógica.** Un módulo nuevo, puro y seguro para el cliente, `src/lib/clock/clock-in-start.ts`:

```ts
export const DEFAULT_CLOCK_IN_START = 360;
export const CLOCK_IN_START_OPTIONS = [240, 300, 360, 420, 480, 540] as const;
export const EARLY_GRACE_MINUTES = 15;
export const EARLY_GRACE_ROLES = [1, 2];

/** Users.ClockInStartMinutes -> minutos efectivos (NULL o inválido = default). */
export function clockInStartFor(saved: number | null | undefined): number;

/** La hora que se registra para un clock-in hecho a `time`. */
export function recordedClockIn(time: Date, startMinutes: number, role: number | undefined): Date;

/** 300 -> "5:00 AM". */
export function formatClockInStart(minutes: number): string;
```

`route.ts` deja de tener `applyEarlyClockInRule` y llama a `recordedClockIn`. `activePunchOrder` ya lee al usuario en cada checada; ese mismo `select` trae `clockInStartMinutes`, así que no hay consulta extra.

**API.** `createUserSchema` y `updateUserSchema` aceptan `clockInStart: number | null` (opcional), validado contra `CLOCK_IN_START_OPTIONS`. `null` regresa al default. `GET /api/users` y `GET /api/users/[id]` devuelven `clockInStart` (`number | null`).

**UI.** En el diálogo de usuario (`admin/users/page.tsx`), un selector "Clock-in start" junto a Part-time y Break order, con las seis opciones y la nota "Pacific time. Earlier punches are recorded as this time." En la lista de usuarios, una insignia (`Starts 5:00 AM`) solo cuando la hora no es el default. El selector va en su propio componente (`_components/clock-in-start-select.tsx`) porque `page.tsx` ya tiene 848 líneas.

## Tech stack (sin cambios)

Next.js 16 (App Router), React 19, TypeScript estricto, Tailwind 4, Prisma 6 sobre SQL Server, NextAuth, Zod, TanStack Query, Radix UI, Vitest 3. **No se agregan dependencias.**

## Comandos

```bash
pnpm test                       # vitest run
pnpm test src/lib/clock         # solo el módulo del reloj
pnpm build                      # next build; exit 0
npx eslint <archivos tocados>
npx prisma generate             # después de editar schema.prisma
```

## Estructura

```
prisma/schema.prisma                                   # + clockInStartMinutes
prisma/migrations/20261110_users_clock_in_start.sql    # nuevo
src/lib/clock/clock-in-start.ts                        # nuevo
src/lib/clock/clock-in-start.test.ts                   # nuevo
src/lib/validators.ts                                  # + clockInStart
src/app/api/clock/action/route.ts                      # usa recordedClockIn
src/app/api/clock/action/route.test.ts                 # + casos por usuario
src/app/api/users/route.ts                             # lee y escribe el campo
src/app/api/users/[id]/route.ts                        # lee y escribe el campo
src/app/api/users/[id]/route.test.ts                   # + casos
src/hooks/use-users.ts                                 # + clockInStart en los tipos
src/app/(dashboard)/admin/users/page.tsx               # selector + insignia
src/app/(dashboard)/admin/users/_components/clock-in-start-select.tsx   # nuevo
```

## Estilo de código

Sigue a `src/lib/clock/break-order.ts`: módulo puro, exports nombrados, constantes con `as const`, sin mutación, comentarios que explican el porqué.

```ts
export function recordedClockIn(time: Date, startMinutes: number, role: number | undefined): Date {
  const grace = role != null && EARLY_GRACE_ROLES.includes(role) ? EARLY_GRACE_MINUTES : 0;
  const earliest = startMinutes - grace;
  const punched = time.getUTCHours() * 60 + time.getUTCMinutes();
  if (punched >= earliest) return time;
  return new Date(Date.UTC(1970, 0, 1, Math.floor(earliest / 60), earliest % 60, 0));
}
```

Migraciones: SQL idempotente con `IF COL_LENGTH(...) IS NULL`, solo aditivo, igual que `20261016_users_break_order.sql`.

## Pruebas

TDD: primero la prueba que falla, luego el código.

- **Unitarias** (`clock-in-start.test.ts`): la tabla de ejemplos de arriba; límites exactos (un segundo antes de `entrada − tolerancia`, el minuto exacto, uno después); `NULL`, valores fuera de la lista y sesión sin rol caen al default; `formatClockInStart`.
- **Ruta de clock-in** (`route.test.ts`): las pruebas actuales de la regla 5:45/6:00 deben pasar **sin modificarse**; son la prueba de que nada cambia para quien no tiene hora configurada. Se agregan casos con `clockInStartMinutes` 300 y 420 para Remote Agent y Closer.
- **Ruta de usuarios** (`[id]/route.test.ts`): un admin guarda 300; `null` regresa al default; 315 y 600 dan 400; un Closer que envía `clockInStart` recibe 403.
- **Manual**, en local: editar un usuario, ver la insignia, recargar y confirmar que el valor persiste.

## Límites

**Siempre:**
- Mantener en verde las pruebas existentes de la regla 5:45/6:00 sin editarlas.
- `pnpm test` y `pnpm build` antes de cada commit.
- Migración solo aditiva y re-ejecutable.

**Preguntar antes:**
- Ejecutar la migración contra producción (`benjaise_BCA`).
- Desplegar a yourdebtcollectors.com.
- Cambiar la hora de entrada de Lauren o de cualquier usuario real.
- Hacer commit, push o abrir PR.
- Cualquier cambio fuera de la lista de archivos de "Estructura".

**Nunca:**
- Modificar registros existentes de `EmployeeTimeLog`.
- Tocar el cálculo de nómina (`src/lib/payroll/`).
- Cambiar las reglas de breaks, lunch u orden de checadas.

## Fuera de alcance

- Conversión automática por zona horaria del empleado (decisión 2).
- Medias horas o hora libre (decisión 3). La columna ya lo permite.
- Hora de salida, turnos por día de la semana o usar `EmployeeSchedule`.
- Mostrar la hora de entrada en la pantalla Clock del empleado.
- Leer el rol desde la base en lugar de la sesión.
- Bitácora de quién cambió la hora de entrada. Hoy ninguna edición de usuario se registra en el activity log; agregarlo es un cambio aparte.

## Criterios de aceptación

1. Un usuario sin hora configurada se comporta exactamente como hoy (5:45 para Admin/Closer, 6:00 para el resto).
2. Con entrada 5:00, un Remote Agent que checa a las 4:30 queda en 5:00 y a las 5:10 queda en 5:10.
3. Con entrada 7:00, un Remote Agent que checa a las 6:30 queda en 7:00.
4. Con entrada 5:00, un Closer que checa a las 4:50 queda en 4:50 y a las 4:30 queda en 4:45.
5. Un admin puede elegir 4, 5, 6, 7, 8 o 9 AM en Users; el valor persiste y aplica en el siguiente clock-in sin cerrar sesión.
6. La API rechaza valores fuera de la lista (400) y a un Closer que intente cambiarla (403).
7. `pnpm test` y `pnpm build` pasan.
