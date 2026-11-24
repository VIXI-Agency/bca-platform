# Tasks: pick the day for Holiday Pay

Plan: [plan.md](plan.md). Spec: [SPEC.md](../../SPEC.md), "change 2".
Branch: `feat/holiday-pay-days`, created from `origin/main`.

## Task 1: Holiday Pay as a dated, hours-based category

**Acceptance criteria:**
- [x] `holidayPay` is in `DATED_BONUS_CATEGORIES` and still in `HOURS_BONUS_FIELDS`. `BONUS_HOURS_KEYS` is gone.
- [x] `DATED_BONUS_RULES.holidayPay` is one per day, no cap, any day. Wheel Spins and CCF rules are unchanged.
- [x] `PayrollBonusEntry.hours Int? @map("Hours")` exists, with an idempotent migration file that also widens the table's Category and Amount CHECK constraints.

**Verification:**
- [x] `pnpm test src/lib/payroll/constants.test.ts src/lib/payroll/pay-schedule-change.test.ts`

**Files:** `src/lib/payroll/constants.ts`, `pay-schedule.ts`, `pay-schedule-change.ts`, `prisma/schema.prisma`, `prisma/migrations/20261124_holiday_pay_days.sql`

## Task 2: Entries API and pay statement read hours per day

**Acceptance criteria:**
- [x] `POST bonus-entries` takes `holidayPay` with whole hours (1 to 999), stores `Amount = 0`, accepts weekends and upcoming days, and refuses a period that has not started, a second entry on the same day, and a locked period.
- [x] `computePayStatement` pays the summed entry hours at the regular rate. Regular and overtime hours do not move.
- [x] `PUT bonus` no longer reads or writes `holidayHours`.

**Verification:**
- [x] `pnpm test "src/app/api/admin/time" src/lib/payroll/pay-statement.test.ts`

**Files:** `bonus-entries/route.ts`, `bonus/route.ts`, `src/lib/validators.ts`, `src/lib/payroll/compute.ts`

## Task 3: Day picker in the editor and the day on the report

**Acceptance criteria:**
- [x] Holiday Pay has its own list (day, hours, Add) before Wheel Spins. The hours box is gone from the grid.
- [x] Total Payment follows the entries and the typed rate, matching the server to the cent.
- [x] The summary prints the day, the hours and the rate on one line.

**Verification:**
- [x] `pnpm test "src/app/(dashboard)/admin/time/_components/payment-report"`
- [ ] Manual in the browser: add Thu 11/26 with 8 h, total rises, reload keeps it, print preview fits one page.

**Files:** `dated-bonus-list.tsx`, `bonus-editor.tsx`, `payment-summary.tsx`, `totals.ts`, `use-payment-report.ts`, `payment-report-tab.tsx`, `src/hooks/use-admin-time.ts`

## Checkpoint
- [x] `pnpm test` (581 passing), `tsc --noEmit` clean, `pnpm build` clean
- [x] `pnpm lint`: 27 problems, the same 27 as `main`

## Task 4: Migration and pull request

**Acceptance criteria:**
- [x] With Carlos's go-ahead, `20261124_holiday_pay_days.sql` has run (2026-11-24): `PayrollBonusEntries.Hours` exists and the two CHECK constraints accept holiday rows. The 31 existing rows are untouched.
- [x] Live check on the shared database: two holiday entries of 8 h (a Saturday and an upcoming Thursday) paid 16 h × $15.00 = $240.00 with regular and overtime hours unchanged. Test rows removed.
- [x] No `PayrollBonuses.HolidayHours` value was saved (0 rows at migration time). Re-check right before the merge.
- [ ] PR from `feat/holiday-pay-days` into `main` is open and linked to an issue. No merge without approval.
