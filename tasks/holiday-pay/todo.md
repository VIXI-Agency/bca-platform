# Tasks: Holiday Pay

Plan: [plan.md](plan.md). Spec: [SPEC.md](../../SPEC.md).
Branch: `feat/holiday-pay`, created from `origin/main`.
Each task: write the failing test first, then the code.

Status 2026-11-24: Tasks 1 to 5 are coded on `feat/holiday-pay`, not committed.
Tests, type check and build pass. The `HolidayHours` column is in the shared database. Browser and print
checks in QA are still open.

## Task 1: Holiday Pay category and the hours × rate rule

**Description:** Declare `holidayPay` once in the payroll constants and add the
single function that turns hours into dollars. Nothing reads hours yet, so the
category pays $0 everywhere and the app behaves as before.

**Acceptance criteria:**
- [x] `BONUS_FIELDS` lists `holidayPay` right after `managerBonus`, with the label "Holiday Pay". It is not in `PERIOD_BONUS_FIELDS`.
- [x] `HOURS_BONUS_FIELDS`, `BONUS_HOURS_KEYS` (`holidayPay → holidayHours`), and `isHoursBonus` are exported.
- [x] `hoursBonusAmount(8, 7)` is 56; `(8, 7.33)` is 58.64; zero, null or blank hours give 0; a null rate gives 0.

**Verification:**
- [x] `pnpm test src/lib/payroll/constants.test.ts`
- [x] `pnpm test` (nothing else broke) and `pnpm lint`

**Dependencies:** None

**Files likely touched:**
- `src/lib/payroll/constants.ts`
- `src/lib/payroll/constants.test.ts`

**Estimated scope:** Small

## Task 2: Save and load holiday hours

**Description:** Add the column and carry `holidayHours` through the bonus API,
so an admin's hours survive a save and a reload.

**Acceptance criteria:**
- [x] `PayrollBonus.holidayHours Int? @map("HolidayHours")` exists, with an idempotent migration file that adds `HolidayHours INT NULL`.
- [x] `PUT /api/admin/time/[userId]/bonus` saves `holidayHours`; `GET` returns it (null when unset).
- [x] The validator rejects negatives, decimals and values above 999 (technical ceiling, not a business cap) with a 400. A locked period still returns 409.

**Verification:**
- [x] `node_modules/.bin/prisma generate`
- [x] `pnpm test "src/app/api/admin/time/[userId]/bonus"`
- [x] `pnpm lint`

**Dependencies:** Task 1

**Files likely touched:**
- `prisma/schema.prisma`
- `prisma/migrations/20261124_holiday_pay.sql`
- `src/lib/validators.ts`
- `src/app/api/admin/time/[userId]/bonus/route.ts` and `route.test.ts`
- `src/hooks/use-admin-time.ts` (`BonusResponse` type)

**Estimated scope:** Medium

## Checkpoint: storage
- [x] `pnpm test` and `pnpm lint` pass
- [x] The migration file is written but NOT run

## Task 3: Holiday Pay in the server pay statement and approval snapshot

**Description:** Make `computePayStatement` pay holiday hours at the regular
rate, and make the approval snapshot record hours, rate and amount.

**Acceptance criteria:**
- [x] `bonusAmounts.holidayPay` equals `hoursBonusAmount(holidayHours, payRate)` and is part of `bonusTotal` and `grossPay`. `PayStatementAmounts` exposes `holidayHours`.
- [x] `regularHours`, `overtimeHours` and `overtimePay` are identical with and without holiday hours.
- [x] The approved statement's Holiday Pay line has `quantity` = hours, `rate` = pay rate, `amount` = the product. No line when it pays $0.

**Verification:**
- [x] `pnpm test src/lib/payroll/pay-statement.test.ts src/app/api/admin/payroll/runs/route.test.ts`
- [x] `pnpm lint`

**Dependencies:** Task 2

**Files likely touched:**
- `src/lib/payroll/compute.ts`
- `src/lib/payroll/pay-statement.test.ts`
- `src/app/api/admin/payroll/runs/route.ts` and `route.test.ts`

**Estimated scope:** Medium

## Task 4: Hours input with a live total in the editor

**Description:** Show the Holiday Pay hours input after Manager Bonus and make
Total Payment follow it as the admin types.

**Acceptance criteria:**
- [x] The input takes whole hours with no business cap (`min="0"`, `max="999"`, `step="1"`, placeholder `0 h`), is seeded from the saved value, marks the form dirty and is sent by Save Bonuses.
- [x] `computeReportTotals` returns the holiday amount from the typed hours and the typed rate. Decimal, negative or non-numeric input counts as 0.
- [x] With hours typed and no pay rate, the field shows "Set a pay rate, or Holiday Pay won't be paid".

**Verification:**
- [x] `pnpm test "src/app/(dashboard)/admin/time/_components/payment-report"`
- [ ] Manual, `pnpm dev`: type 8 for a rep at $7.00, Total Payment rises by $56.00 before saving; save, reload, the 8 is still there.

**Dependencies:** Task 2

**Files likely touched:**
- `payment-report/totals.ts` and `totals.test.ts`
- `payment-report/use-payment-report.ts`
- `payment-report/bonus-editor.tsx`
- `payment-report/payment-report-tab.tsx` (pass the new props)

**Estimated scope:** Medium

## Task 5: Holiday Pay line on the report and the printed PDF

**Description:** Print the line with its math so the rep can check it.

**Acceptance criteria:**
- [x] The summary shows `Holiday Pay (8 h × $7.00)` with `$56.00`, in the `BONUS_FIELDS` position (after Manager Bonus).
- [x] The line is hidden when the amount is 0.
- [ ] With every bonus category filled in, the printed report still fits one page.

**Verification:**
- [x] `pnpm test "src/app/(dashboard)/admin/time/_components/payment-report/payment-summary.test.ts"`
- [ ] Manual: browser print preview of a fully loaded report.

**Dependencies:** Task 4

**Files likely touched:**
- `payment-report/payment-summary.tsx` and `payment-summary.test.ts`
- `payment-report/payment-report-tab.tsx` (pass hours to the summary)

**Estimated scope:** Small

## Checkpoint: feature complete
- [x] `pnpm test`, `pnpm lint` and `pnpm build` pass
- [ ] Every SPEC success criterion is met locally
- [ ] Review with Carlos before touching the database

## Task 6: Migration, QA check and pull request

**Description:** Ship it in the safe order: column first, code second.

**Acceptance criteria:**
- [x] With Carlos's go-ahead, `20261124_holiday_pay.sql` has run on the shared database and `HolidayHours` exists. (Run 2026-11-24.)
- [ ] In QA: 8 h for a rep with a known rate shows the right total on screen and on the PDF; after approving the run, changing the rate leaves the statement unchanged; a locked period rejects the edit.
- [ ] A PR from `feat/holiday-pay` into `main` is open, links SPEC.md and waits for approval. No merge without it, since `main` deploys to production.

**Verification:**
- [x] `SELECT COL_LENGTH('benjaise_sqluser2.PayrollBonuses', 'HolidayHours')` returns a value (4, an INT; 94 rows untouched)
- [ ] QA walkthrough above, done by hand
- [ ] CI green on the PR

**Dependencies:** Tasks 1 to 5

**Files likely touched:** none (release steps)

**Estimated scope:** Small
