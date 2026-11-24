# Implementation Plan: Holiday Pay on the Payment Report

Spec: [SPEC.md](../../SPEC.md). Tasks: [todo.md](todo.md).

## Overview

Add a Holiday Pay field to Bonuses & Incentives where the admin types whole
hours (no business cap). The app pays `hours × regular pay rate`, shows the math on the
report and the PDF, and snapshots hours, rate and amount when payroll is
approved.

## Architecture Decisions

- **One rule, one function.** `hoursBonusAmount(hours, payRate)` in
  `src/lib/payroll/constants.ts` is the only place the math lives. The live
  preview (`totals.ts`) and the server (`compute.ts`) both call it, so the
  screen and the approved statement cannot disagree.
- **`holidayPay` is a bonus category, stored as hours.** It joins
  `BONUS_FIELDS` after `managerBonus`, so every total, summary and statement
  loop picks it up. It stays out of `PERIOD_BONUS_FIELDS` because those are
  dollar columns. A new `HOURS_BONUS_FIELDS` list marks it as typed in hours.
- **Store hours only.** New column `PayrollBonuses.HolidayHours INT NULL`. The
  dollar amount is derived on read. It is written only into the approval
  snapshot (`PayStatementLine.quantity`, `.rate`, `.amount`), which already has
  those columns.
- **Rate at approval wins.** Before approval the amount follows the rep's
  current rate. Approval freezes it, the same way regular pay is frozen today.
- **Branch off `origin/main`.** Local `main` has diverged (10 ahead, 76
  behind) and does not contain the payroll code. Work happens on
  `feat/holiday-pay`, created from `origin/main`.

## Dependency Graph

```
T1 constants + hoursBonusAmount
 ├── T2 column, validator, bonus API      (storage)
 │    ├── T3 computePayStatement + statement lines   (server pay)
 │    └── T4 editor input + live total               (admin UI)
 │         └── T5 summary line on report and PDF
 └── T6 migration on the shared DB, QA check, PR
```

T3 and T4 are independent once T2 is in. Everything else is sequential.

## Task List

### Phase 1: Rule and storage
- [x] Task 1: Holiday Pay category and the hours × rate rule
- [x] Task 2: Save and load holiday hours

### Checkpoint: storage
- [ ] `pnpm test` and `pnpm lint` pass; `prisma generate` is clean

### Phase 2: Pay and screen
- [x] Task 3: Holiday Pay in the server pay statement and approval snapshot
- [x] Task 4: Hours input with a live total in the editor
- [x] Task 5: Holiday Pay line on the report and the printed PDF

### Checkpoint: feature complete
- [ ] All SPEC success criteria met locally; `pnpm build` is clean
- [ ] Review with Carlos before touching the database

### Phase 3: Release
- [ ] Task 6: Migration, QA check and pull request

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| QA and prod share one database, so the migration reaches prod at once | Med | Additive nullable column with an `IF COL_LENGTH` guard. Old code ignores it. Run only with Carlos's go-ahead, before the deploy. |
| Deploying code before the column exists | High | Prisma would fail every `PayrollBonuses` read. Order is fixed: migration first, merge second. |
| Merging to `main` auto-deploys to production | High | Open a PR and wait for approval. No direct push. |
| Preview and server math drift apart | Med | Both call `hoursBonusAmount`. Tests cover each side with the same cases. |
| The extra line pushes the PDF to a second page | Low | Check print preview with every bonus filled in (Task 5). |
| Adding a key to `BONUS_FIELDS` breaks a `Record<BonusFieldKey, …>` somewhere | Low | TypeScript flags it. Task 1 runs `tsc --noEmit` on the touched files plus the full test suite. |
| Statement views read old snapshots without a `holidayPay` line | Low | Lines are optional per category. Old statements show nothing for it. |

## Open Questions

None. Rate, entry mode, whole hours and "no limit" are settled in the spec.
