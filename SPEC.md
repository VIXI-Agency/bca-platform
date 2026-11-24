# Spec: Holiday Pay on the Payment Report

## Objective

Payroll admins need to pay reps for holidays. Today the Payment Report
(Admin → Time Management → Payment Report → "Bonuses & Incentives") only takes
dollar amounts, so the admin would have to work out `hours × rate` by hand for
each rep.

Add a **Holiday Pay** field where the admin types **hours**, and the app works
out the dollars from that rep's own pay rate.

**User:** administrators (role 1) preparing weekly pay. Reps see the result as a
line on their printed Payment Report.

**Request (Slack, confirmed by the requester):** "add Holiday Pay … put the
amount of hours we are paying and have it calculate the total based on each
rep's pay" — "this field would be the amount of hours being paid".

### Behavior

1. A **Holiday Pay** input appears in the Bonuses & Incentives grid, right after
   Manager Bonus. It takes hours (placeholder `0 h`), not dollars.
2. Amount paid = `round2(holidayHours × payRate)`, using the rep's **regular**
   pay rate (never the OT rate).
3. The amount updates live as the admin types hours or changes the rate, like
   the rest of the report, and is saved with **Save Bonuses**.
4. The report and the printed PDF show one line, with the math visible:
   `Holiday Pay (8 h × $7.00) ............ $56.00`
   The line is hidden when hours are 0 or blank.
5. Holiday Pay is part of the bonus total and of Total Payment / gross pay.
6. Holiday hours are **not** worked hours: they do not add to Regular hours and
   never trigger or count toward overtime.
7. If the rep has no pay rate, Holiday Pay is $0 and the editor shows a warning
   under the field ("Set a pay rate, or Holiday Pay won't be paid") — same
   pattern as the existing "Add the $ amount" hint.
8. When payroll is approved, the statement snapshots the hours, the rate and
   the amount (`PayStatementLine.quantity`, `.rate`, `.amount`). A later rate
   change does not alter an approved statement.
9. A locked (approved/paid) period refuses edits, as it does for every bonus.

### Assumptions (correct these before build)

1. Holiday Pay is paid at the **regular** rate, 1×. No holiday premium (1.5×).
2. Hours are typed **per rep, per pay period**. No "apply 8 h to everyone"
   bulk action, and no holiday calendar that fills it in automatically.
3. One number per period (total holiday hours), not one entry per holiday date.
4. Hours are whole numbers, 0 or more. No decimals and no business cap
   (the requester said "No limit"). The field only has a 3-digit technical
   ceiling (999), the same one the Accounts and Verified Leads counts use.
5. Until payroll is approved the amount follows the rep's **current** rate; it
   is frozen at approval.
6. It is grouped under bonuses (counts in the bonus total), not shown as a
   third kind of hours next to Regular and Overtime.

## Tech Stack

Next.js 16 (App Router), React 19, TypeScript, Prisma 6 on SQL Server, zod
validators, TanStack Query, Tailwind 4, Vitest. No new dependencies.

## Commands

```bash
pnpm dev                              # local dev server
pnpm test                             # vitest run (all)
pnpm test src/lib/payroll             # payroll unit tests only
pnpm lint                             # eslint
pnpm build                            # next build
node_modules/.bin/prisma generate     # after editing prisma/schema.prisma
```

## Project Structure

Files this feature touches (all exist on `origin/main`):

```
prisma/schema.prisma                         PayrollBonus.holidayHours (new Int? column)
prisma/migrations/<date>_holiday_pay.sql     additive, idempotent migration
src/lib/payroll/constants.ts                 'holidayPay' category, label, HOURS_BONUS_FIELDS
src/lib/payroll/compute.ts                   computePayStatement: hours × payRate
src/lib/validators.ts                        payrollBonusSchema.holidayHours
src/app/api/admin/time/[userId]/bonus/route.ts        GET/PUT holidayHours
src/app/api/admin/payroll/runs/route.ts               snapshot line with quantity + rate
src/hooks/use-admin-time.ts                           bonus types
src/app/(dashboard)/admin/time/_components/payment-report/
  bonus-editor.tsx        the hours input + no-rate warning
  totals.ts               live calculation
  payment-summary.tsx     "Holiday Pay (8 h × $7.00)" line
  use-payment-report.ts   input state, dirty check, save payload
  seed.ts                 seed the input from the saved value
```

Tests sit beside the code (`*.test.ts`).

## Code Style

Follow the existing pattern: categories are declared once in
`src/lib/payroll/constants.ts` and everything else derives from those lists.
Holiday Pay is a new *kind* of category (typed as hours, paid as dollars), so it
gets its own list instead of special cases scattered in components:

```ts
/** Bonuses typed as hours and paid at the employee's regular rate. */
export const HOURS_BONUS_FIELDS = ['holidayPay'] as const;
export type HoursBonusField = (typeof HOURS_BONUS_FIELDS)[number];

/** Where each hours bonus keeps its hours (API field = PayrollBonuses column). */
export const BONUS_HOURS_KEYS = {
  holidayPay: 'holidayHours',
} as const satisfies Record<HoursBonusField, string>;

export const isHoursBonus = (key: string): key is HoursBonusField =>
  (HOURS_BONUS_FIELDS as readonly string[]).includes(key);

/** What an hours bonus pays: nothing without a rate. */
export function hoursBonusAmount(hours: number | null | undefined, payRate: number | null): number {
  if (!(hours != null && hours > 0) || payRate == null) return 0;
  return Math.round(hours * payRate * 100) / 100;
}
```

- `holidayPay` joins `BONUS_FIELDS` (after `managerBonus`) and
  `BONUS_FIELD_LABELS`, but **not** `PERIOD_BONUS_FIELDS` — those are dollar
  columns.
- The client (`totals.ts`) and the server (`compute.ts`) both call
  `hoursBonusAmount`, so the preview and the approved statement cannot drift.
- Only hours are stored. The dollar amount is derived, never persisted outside
  the approval snapshot.
- Comments explain why, not what, matching the surrounding files.

## Testing Strategy

Vitest, colocated. Write the failing test first for each rule.

| Level | File | Covers |
|---|---|---|
| Unit | `constants.test.ts` | `hoursBonusAmount`: 8 h × $7.00 = $56.00; cents (8 h × $7.33 = $58.64); 0, blank and null hours → 0; null rate → 0 |
| Unit | `pay-statement.test.ts` | holiday pay included in `bonusTotal` and `grossPay`; regular and overtime hours unchanged; no rate → $0 |
| Unit | `totals.test.ts` | live total follows typed hours and typed rate; invalid, decimal or negative input → 0 |
| Unit | `payment-summary.test.ts` | line reads `Holiday Pay (8 h × $7.00)`; hidden at 0 |
| Route | `bonus/route.test.ts` | PUT saves and GET returns `holidayHours`; rejects negative, decimal and > 999; 409 on a locked period |
| Route | `payroll/runs/route.test.ts` | snapshot line has `quantity` = hours, `rate` = pay rate, `amount` = product |

Manual check before release: in QA, enter 8 h for a rep with a known rate,
confirm the screen total and the printed PDF (still one page), approve the
run, then change the rate and confirm the approved statement did not move.

## Boundaries

- **Always:** derive amounts through `hoursBonusAmount`; keep the migration
  additive and idempotent (`IF COL_LENGTH(...) IS NULL`); run `pnpm test` and
  `pnpm lint` before committing; work on a feature branch off `origin/main`.
- **Ask first:** running the migration (QA and prod share one database, so it
  hits production immediately); merging to `main` (auto-deploys to prod);
  any change to how regular or overtime hours are computed; adding a holiday
  calendar or bulk entry.
- **Never:** store the computed dollar amount on `PayrollBonuses`; count
  holiday hours toward overtime; change existing columns or rows; alter
  approved or paid statements.

## Success Criteria

- [ ] Holiday Pay input shows after Manager Bonus and accepts whole hours with no business cap (0 to 999).
- [ ] Typing 8 for a rep at $7.00/h shows `Holiday Pay (8 h × $7.00)  $56.00` and raises Total Payment by $56.00 before saving.
- [ ] Save Bonuses persists the hours; reloading the report shows them again.
- [ ] Regular hours, overtime hours and overtime pay are identical with and without holiday hours.
- [ ] A rep with no pay rate shows the warning and $0 Holiday Pay.
- [ ] The printed Payment Report shows the line and still fits one page.
- [ ] Approving payroll writes a statement line with quantity, rate and amount; a later rate change leaves it unchanged.
- [ ] A locked period rejects holiday-hour edits with 409.
- [ ] All existing tests pass; new tests above pass; lint and build are clean.

## Open Questions

None.

Resolved with the requester's side on 2026-11-24:

- Holiday Pay uses the regular rate at 1×. No holiday premium.
- Hours are typed rep by rep. No bulk "apply to all".
- A rep who worked the holiday can also get holiday hours. Nothing blocks it.
- Hours are whole numbers. No cap per pay period ("No limit", confirmed in
  Slack on 2026-11-24). Only the 999 technical ceiling applies.
