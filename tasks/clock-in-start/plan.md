# Plan: hora de entrada por usuario

Contrato: `docs/specs/clock-in-start.md`. Lista de tareas: `tasks/clock-in-start/todo.md`.
(`tasks/plan.md` y `tasks/todo.md` son del refactor de `admin/time` y no se tocan.)

## Rama

`feat/clock-in-start`, creada desde `main`. La rama actual del repo es `feat/report-notes`, que es otro trabajo.

## Dependencias

```
T1 columna + schema Prisma
 ├─> T2 regla de clock-in (módulo puro + ruta)      <- el valor se puede poner por SQL
 └─> T3 API de usuarios (leer / guardar)
        └─> T4 UI en Users (selector + insignia)
                └─> T5 salida a producción (requiere aprobación)
```

T2 y T3 no dependen entre sí; ambas dependen de T1. T4 necesita T3. El módulo `clock-in-start.ts` nace en T2 y T3/T4 reutilizan sus constantes, así que T2 va primero.

## Cortes

Cada tarea deja el sistema funcionando y desplegable:

- Después de T2, la regla nueva ya funciona de punta a punta para quien tenga valor en la columna; sin valor, todo sigue igual.
- Después de T3, un admin puede configurarla por API.
- Después de T4, desde la pantalla.

## Decisiones técnicas

| Decisión | Motivo |
|---|---|
| Columna en minutos (`SMALLINT NULL`), no horas | Permite medias horas después sin migrar. |
| `NULL` = default 6:00 | Ningún registro existente cambia; la migración es solo aditiva. |
| Leer la hora en `activePunchOrder` | Esa función ya consulta al usuario en cada checada; no hay consulta extra y el cambio aplica sin cerrar sesión. |
| El rol sigue viniendo de la sesión | No cambiar comportamiento existente en este PR. |
| Lista cerrada de opciones validada con Zod | Una hora mal capturada afecta la paga. |
| Selector en componente propio | `admin/users/page.tsx` ya tiene 848 líneas. |

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Romper la regla actual 5:45/6:00, que afecta la paga de los 39 usuarios activos | Las pruebas existentes de `route.test.ts` deben pasar sin editarse (T2). |
| Desplegar el código antes de la migración: Prisma pediría una columna que no existe y fallarían el clock-in y Users | En T5 la migración va primero y se verifica antes del deploy. |
| Olvidar el cambio manual de DST (marzo y noviembre) | Queda documentado en T5; el próximo es el 14 de marzo de 2027. |
| Un valor inválido en la columna (escrito por SQL) | `clockInStartFor` cae al default; con prueba. |
| Empleado con entrada tardía (7:00) que checa temprano y espera que cuente | Es la regla pedida; la nota del selector lo dice. |

## Checkpoints

- **A, después de T2:** `pnpm test` en verde con las pruebas viejas intactas. Revisión de la regla antes de seguir.
- **B, después de T4:** `pnpm build`, eslint en archivos tocados, prueba manual en local, revisión de código. Aquí se pide aprobación para commit y PR.
- **C, T5:** cada paso de producción con aprobación explícita.

## Verificación final

Los 7 criterios de aceptación del spec, más: diff limitado a los archivos listados en "Estructura" del spec.
