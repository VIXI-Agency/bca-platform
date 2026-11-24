# Implementation Plan: custom bonuses

Spec: [SPEC.md](../../SPEC.md), section "change 3". Tasks: [todo.md](todo.md).

## Overview

Payroll can add bonuses it names itself ("Raffle", "Birthday Bonus"): a name
and a dollar amount, up to 5 per rep per pay period. They print under the
typed name and count in Total Payment.

## Architecture Decisions

- **A table of its own.** `PayrollCustomBonuses` (user, period, name, amount).
  The dated-entries table needs a date and has category rules, so reusing it
  would mean loosening its constraints again. A new table changes nothing that
  exists.
- **Not a `BONUS_FIELDS` category.** The names are free text, so custom
  bonuses travel beside `bonusAmounts` as a list and are added into
  `bonusTotal` on both sides (preview and server).
- **Suggestions come from history.** `GET` returns the names already used,
  most used first, plus two starter names. No list to maintain.
- **Rules in one function.** `customBonusRuleError` (cap, repeated name) is
  used by the box and by the API, inside a serializable transaction.
- **Snapshot by name.** Approval writes a `PayStatementLine` per bonus with
  `category = 'custom'` and the typed name as `label`.

## Task List

- [x] Task 1: Table, rules and API
- [x] Task 2: Pay statement, approval snapshot and pay-week change
- [x] Task 3: The box, the live total and the report lines
- [ ] Task 4: Migration and pull request

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Code deployed before the table exists | High | `computePayStatement` reads it for every employee, so payroll would fail. Migration first, merge second. |
| Many custom lines push the PDF to a second page | Med | Cap of 5 per period. Check print preview with every bonus filled in. |
| The same bonus spelled several ways | Low | Suggestions from past names; a repeated name in one period is refused. |
| A pay-week change strands a custom bonus | Low | The change is refused, as it is for typed weekly bonuses. |

## Open Questions

Whether 5 per period is enough (see the spec).
