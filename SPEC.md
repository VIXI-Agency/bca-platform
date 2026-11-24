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

---

# Spec, change 2: pick the day for Holiday Pay

Status: approved by Carlos on 2026-11-24. Everything above shipped in
[#82](https://github.com/VIXI-Agency/bca-platform/pull/82) and stays true
unless this section says otherwise.

## Objective

The requester asked on 2026-11-24: "could we also add the option of selecting
a day. like the wheel spins & CCFs". Today Holiday Pay is one hours box per
pay period, so the report cannot say which holiday was paid.

Holiday Pay becomes a dated entry, like Wheel Spins and CCF Spiffs: the admin
picks a **day** and types the **hours** for that day. The app still pays
`hours × regular pay rate`.

**User:** administrators (role 1). Reps see the day on their printed report.

### Behavior

1. Holiday Pay leaves the amounts grid and gets its own box next to Wheel
   Spins and CCF Spiffs: a day picker, an hours input and an Add button. Saved
   entries list below as `Thu 11/26 · 8 h · $120.00`, each with a remove button.
2. An entry saves when the admin clicks Add. Save Bonuses is not needed, the
   same as Wheel Spins.
3. Amount per entry = `hoursBonusAmount(hours, payRate)`. The period's Holiday
   Pay is `hoursBonusAmount(total hours, payRate)`, so the printed math checks.
4. The report and the PDF print one line, in the format Wheel Spins uses
   (label, a dash, then the days): `Thu 11/26 8 h × $15.00` and `$120.00`.
   With two days: `Thu 11/26 8 h · Fri 11/27 8 h (16 h × $15.00)`.
5. Unchanged from change 1: regular rate only, whole hours, never counts
   toward overtime, $0 plus a warning when the rep has no pay rate, locked
   once the period is approved, snapshot of total hours, rate and amount at
   approval.

### Decisions (confirmed 2026-11-24)

1. The day + hours entry **replaces** the single hours box. Both at once would
   let a holiday be paid twice. No rep has holiday hours saved yet (checked
   in the database on 2026-11-24), so nothing needs converting.
2. The picker offers **every day of the rep's pay period**: weekends too, and
   days that have not happened yet. Wheel Spins and CCFs only offer Monday to
   Friday days already past, but a holiday can fall on a weekend and payroll
   may be prepared before the holiday. The server only refuses a day in a pay
   period that has not started, so a typo cannot file a holiday far ahead.
3. **One entry per day**, as many days as needed. No cap on hours beyond the
   999 technical ceiling ("No limit" still stands).
4. Hours stay whole numbers.

## Tech Stack

Unchanged. No new dependencies.

## Commands

Unchanged (see above).

## Project Structure

```
prisma/schema.prisma                         PayrollBonusEntry.hours (new Int? column)
prisma/migrations/<date>_holiday_pay_days.sql   additive, idempotent
src/lib/payroll/constants.ts                 holidayPay becomes a dated category paid by the hour
src/lib/payroll/compute.ts                   holiday hours = sum of the period's entries
src/lib/payroll/pay-schedule-change.ts       holiday entries re-file with the others
src/lib/validators.ts                        drop holidayHours from payrollBonusSchema
src/app/api/admin/time/[userId]/bonus/route.ts          stop reading and writing holidayHours
src/app/api/admin/time/[userId]/bonus-entries/route.ts  accept holidayPay with hours
src/hooks/use-admin-time.ts                  BonusEntry.hours, add-entry payload
payment-report/dated-bonus-list.tsx          hours input for hours categories
payment-report/bonus-editor.tsx              remove the hours box from the grid
payment-report/totals.ts, use-payment-report.ts   hours come from entries
payment-report/payment-summary.tsx           line with the days
```

## Code Style

Same rule as before: declare the category once, derive the rest.

```ts
export const DATED_BONUS_CATEGORIES = ['holidayPay', 'wheelSpins', 'ccfSpiffs'] as const;

/** maxPerPeriod null = no cap; anyDay = weekends and upcoming days allowed. */
export const DATED_BONUS_RULES = {
  holidayPay: { maxPerPeriod: null, onePerDay: true, anyDay: true },
  wheelSpins: { maxPerPeriod: 2, onePerDay: false, anyDay: false },
  ccfSpiffs: { maxPerPeriod: 5, onePerDay: true, anyDay: false },
};
```

- `HOURS_BONUS_FIELDS` and `hoursBonusAmount` stay. A holiday entry stores
  `Hours` and an `Amount` of 0: dollars are still derived, never stored.
- `PayrollBonuses.HolidayHours` stays in the database, unread, like the legacy
  `WheelSpins` column. `BONUS_HOURS_KEYS` and the grid input are removed.

## Testing Strategy

| Level | File | Covers |
|---|---|---|
| Unit | `constants.test.ts` | holiday rule: second entry on the same day refused, no cap on count |
| Route | `bonus-entries/route.test.ts` | POST holidayPay with hours; rejects decimals, 0, above 999, a second entry on the same day, a day in a pay period that has not started; accepts a weekend and an upcoming day; 409 when locked. Wheel Spins and CCFs behave as before |
| Route | `bonus/route.test.ts` | `holidayHours` is no longer accepted or returned |
| Unit | `pay-statement.test.ts` | holiday pay = summed entry hours × rate; overtime untouched |
| Unit | `totals.test.ts`, `payment-summary.test.ts` | live total from entries; line with one day and with two |
| Unit | `pay-schedule-change` tests | holiday entries move with a schedule switch |

## Boundaries

- **Always:** additive, idempotent migration; `hoursBonusAmount` for every
  amount; feature branch off `origin/main`; tests and lint before committing.
- **Ask first:** running the migration (shared database, reaches production at
  once); merging to `main` (deploys to production).
- **Never:** drop `HolidayHours` or any column; store dollars for holiday
  entries; change Wheel Spins or CCF rules; touch approved or paid statements.

## Success Criteria

- [ ] Holiday Pay shows a day picker, an hours input and Add, next to Wheel Spins and CCF Spiffs. The old hours box is gone.
- [ ] Adding Thu 11/26 with 8 h for a rep at $15.00 raises Total Payment by $120.00 at once, and survives a reload.
- [ ] The report prints the day, the hours and the rate on one line.
- [ ] A second entry on the same day is refused. Two different days both pay.
- [ ] A weekend day and an upcoming day of the period can be picked.
- [ ] Overtime and regular hours are identical with and without entries.
- [ ] A locked period refuses add and remove with 409.
- [ ] Approval snapshots total hours, rate and amount.
- [ ] Wheel Spins and CCF Spiffs behave exactly as before.
- [ ] All tests pass; lint shows no new problems; build is clean.

## Open Questions

None. The three questions (replace the box, any day, one entry per day) were
answered on 2026-11-24 and are recorded under Decisions.

---

# Spec, change 3: custom bonuses

Status: approved by Carlos on 2026-11-24 ("ok dale"), after the requester said
"The Custom Bonus box it's even better".

## Objective

Payroll first asked for Raffle and Birthday Bonus boxes (amounts only, no
date), then explained that it adds one-off bonuses all the time. The
Thanksgiving bonuses went into Discretionary Bonus because no box fit. A fixed
box per bonus would bring the same request back each time.

Add **Custom Bonuses**: payroll types a name and a dollar amount, and that
name is what prints on the report.

### Behavior

1. A Custom Bonuses box sits with Holiday Pay, Wheel Spins and CCF Spiffs: a
   name, an amount and Add. Saved bonuses list below, each with a remove button.
2. A bonus saves on Add. Save Bonuses is not needed.
3. The name box suggests names used before, most used first, so "Birthday
   Bonus" is spelled one way. "Raffle" and "Birthday Bonus" are offered from
   day one. Any other name can be typed.
4. Each custom bonus prints as its own line, after the other bonuses, and adds
   to the bonus total and Total Payment.
5. Approving payroll snapshots one statement line per custom bonus, with the
   typed name as its label.
6. A locked period refuses add and remove.

### Decisions

1. Dollar amounts only. No date and no hours (confirmed in Slack).
2. At most **5 per rep per pay period**, so the printed report stays on one
   page. This cap is Carlos's proposal and can be raised.
3. The same name cannot be added twice in one period. To change an amount,
   remove the bonus and add it again.
4. Names are up to 40 characters.
5. No dedicated Raffle or Birthday boxes. Bonuses already typed into
   Discretionary Bonus stay where they are.

## Project Structure

```
prisma/schema.prisma                            PayrollCustomBonus (new model)
prisma/migrations/20261124_custom_bonuses.sql   new table, idempotent
src/lib/payroll/constants.ts                    cap, name length, customBonusRuleError
src/lib/payroll/compute.ts                      customBonuses in the statement and bonusTotal
src/app/api/admin/time/[userId]/custom-bonuses/route.ts   GET (with suggestions), POST
src/app/api/admin/time/custom-bonuses/[id]/route.ts       DELETE
src/app/api/admin/payroll/runs/route.ts         one snapshot line per custom bonus
src/app/api/users/[id]/pay-schedule/route.ts    a pay-week change cannot strand one
src/hooks/use-admin-time.ts                     useCustomBonuses, add, remove
payment-report/custom-bonus-list.tsx            the box
payment-report/totals.ts, payment-summary.tsx   live total and report lines
```

Tech stack, commands and code style are unchanged.

## Testing Strategy

| Level | File | Covers |
|---|---|---|
| Unit | `constants.test.ts` | cap of 5, repeated name, name tidying |
| Route | `custom-bonuses/route.test.ts` | list, suggestions, add, cap, repeated name, bad input, locked period, admin only, delete |
| Unit | `pay-statement.test.ts`, `totals.test.ts` | custom bonuses in the bonus total and gross pay; preview equals server |
| Route | `payroll/runs/route.test.ts` | snapshot line per custom bonus |
| Route | `pay-schedule/route.test.ts` | pay-week change refused when it would strand one |
| Unit | `custom-bonus-list.test.ts`, `payment-summary.test.ts`, `bonus-editor.test.ts` | the box, the printed lines, the wiring |

## Boundaries

- **Always:** additive, idempotent migration; tests and lint before committing.
- **Ask first:** running the migration (shared database); merging to `main`.
- **Never:** change existing tables or rows; touch approved or paid statements.

## Success Criteria

- [ ] Adding "Raffle" with $50.00 raises Total Payment by $50.00 at once and survives a reload.
- [ ] The report prints one line per custom bonus with the typed name.
- [ ] The name box suggests Raffle and Birthday Bonus, then names used before.
- [ ] A sixth bonus and a repeated name are refused with a clear message.
- [ ] A locked period refuses add and remove with 409.
- [ ] Approval writes one statement line per custom bonus.
- [ ] The other bonuses behave exactly as before.
- [ ] All tests pass; lint shows no new problems; build is clean.

## Open Questions

1. Is 5 per rep per pay period enough for payroll? (Carlos to confirm with the team.)
