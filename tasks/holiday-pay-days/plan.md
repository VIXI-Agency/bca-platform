# Implementation Plan: pick the day for Holiday Pay

Spec: [SPEC.md](../../SPEC.md), section "change 2". Tasks: [todo.md](todo.md).
Follows [tasks/holiday-pay](../holiday-pay/plan.md), which shipped the hours box.

## Overview

Holiday Pay becomes a dated entry like Wheel Spins and CCF Spiffs. The admin
picks a day of the pay period and types the hours for it. The app still pays
`hours × regular pay rate`, on the period's total hours.

## Architecture Decisions

- **Reuse the dated-entry path.** `holidayPay` joins `DATED_BONUS_CATEGORIES`,
  so the entries API, the list component, the lock check and the pay-week
  re-filing all cover it without a second code path.
- **Rules live in one table.** `DATED_BONUS_RULES` gains `anyDay` and a
  nullable `maxPerPeriod`. Holiday Pay is `{ null, onePerDay, anyDay }`.
- **Hours on the entry, dollars derived.** New column
  `PayrollBonusEntries.Hours INT NULL`. A holiday entry stores `Amount = 0`.
  The table's CHECK constraints enforce it: dollars and no hours for Wheel
  Spins and CCF Spiffs, hours and no dollars for Holiday Pay.
- **Pay the total once.** The period amount is
  `hoursBonusAmount(sum of hours, rate)`, the same in the preview and on the
  server, so "16 h × $7.33" on paper equals the amount paid.
- **Leave the old column.** `PayrollBonuses.HolidayHours` held no data. The app
  stops reading and writing it; nothing is dropped.

## Dependency Graph

```
T1 rules + Hours column
 ├── T2 entries API and server pay
 │    └── T3 editor list, live total, report line
 └── T4 migration, PR
```

## Task List

- [x] Task 1: Holiday Pay as a dated, hours-based category
- [x] Task 2: Entries API and pay statement read hours per day
- [x] Task 3: Day picker in the editor and the day on the report
- [ ] Task 4: Migration and pull request

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Code deployed before the `Hours` column exists | High | Every entries read would fail, Wheel Spins included. Migration first, merge second. |
| Shared database: the migration reaches production at once | Med | One nullable column, plus two CHECK constraints widened so holiday rows fit. Existing rows already satisfy them and old code is unaffected. |
| A holiday entered far in the future by mistake | Low | Server refuses a pay period that has not started. |
| Hours saved in the old box are lost | Low | Checked on 2026-11-24: no row has `HolidayHours`. Re-check right before the merge. |
| The longer line pushes the PDF to a second page | Low | One line per category, as Wheel Spins already does. Check print preview. |

## Open Questions

None.
