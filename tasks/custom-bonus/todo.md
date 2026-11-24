# Tasks: custom bonuses

Plan: [plan.md](plan.md). Spec: [SPEC.md](../../SPEC.md), "change 3".
Branch: `feat/custom-bonus`, created from `origin/main`.

## Task 1: Table, rules and API

**Acceptance criteria:**
- [x] `PayrollCustomBonus` model and an idempotent migration that only creates the table.
- [x] `GET custom-bonuses` lists the period's bonuses and suggests past names, then Raffle and Birthday Bonus.
- [x] `POST` adds one (name up to 40 characters, amount above 0 with cents); refuses a sixth, a repeated name and a locked period. `DELETE` removes one.

**Verification:**
- [x] `pnpm test "src/app/api/admin/time/[userId]/custom-bonuses" src/lib/payroll/constants.test.ts`

## Task 2: Pay statement, approval snapshot and pay-week change

**Acceptance criteria:**
- [x] `computePayStatement` returns `customBonuses` and counts them in `bonusTotal` and `grossPay`.
- [x] Approval writes one line per custom bonus, labelled with its name.
- [x] A pay-week change that would strand a custom bonus is refused.

**Verification:**
- [x] `pnpm test src/lib/payroll src/app/api/admin/payroll "src/app/api/users/[id]/pay-schedule"`

## Task 3: The box, the live total and the report lines

**Acceptance criteria:**
- [x] The Custom Bonuses box shows after CCF Spiffs with name suggestions, a counter and remove buttons.
- [x] Total Payment follows the saved custom bonuses and equals the server to the cent.
- [x] The summary prints each one after the other bonuses.

**Verification:**
- [x] `pnpm test "src/app/(dashboard)/admin/time/_components/payment-report"`
- [ ] Manual in the browser: add Raffle $50, total rises, reload keeps it, print preview fits one page.

## Checkpoint
- [x] `pnpm test` (623 passing), `tsc --noEmit` clean, `pnpm build` clean
- [x] `pnpm lint`: 27 problems, the same 27 as `main`

## Task 4: Migration and pull request

**Acceptance criteria:**
- [x] With Carlos's go-ahead, `20261124_custom_bonuses.sql` has run (2026-11-24, twice to confirm it is repeatable) and `PayrollCustomBonuses` exists, empty.
- [x] Live check on user 2: Raffle $50.00 and Birthday Bonus $25.50 raised gross pay by $75.50 with regular pay unchanged; the database refused a $0 amount and a blank name. Test rows removed.
- [ ] PR from `feat/custom-bonus` into `main` is open and linked to an issue. No merge without approval.
