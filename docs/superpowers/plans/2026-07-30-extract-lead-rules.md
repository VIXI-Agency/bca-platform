# Extract Lead Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the lead validation rules out of `/api/import` into a shared, unit-tested module so the scraper endpoint can call the same code instead of copying it.

**Architecture:** A new `src/lib/leads.ts` holds the rules. Pure functions (phone normalization, area-code derivation, blocklist classification) are separated from database-touching ones so the valuable logic is unit-testable without a database. `/api/import` becomes a thin caller and its observable behavior does not change, which is what the characterization tests in Task 2 lock down. The area-code bug is fixed only after the extraction is proven behavior-identical.

**Tech Stack:** TypeScript, Next.js 16 App Router, Prisma 6 against SQL Server, Vitest (added by this plan).

## Global Constraints

- Node 18.20.6 on the server; Next declares `engines.node >=20.9.0` as advisory only.
- Package manager is `pnpm` locally; the production and QA servers run `npm install`.
- `pnpm-workspace.yaml` must keep its `allowBuilds` entries or `pnpm install` exits non-zero.
- Prisma writes `DateTime` as UTC. Do not introduce `GETDATE()` defaults.
- Migrations are hand-written `.sql` in `prisma/migrations/` plus a matching `schema.prisma` edit. This project does not use Prisma Migrate.
- All new Prisma models need an explicit `@@schema("dbo")`, because `schema.prisma` declares three schemas.
- `PhoneDigits` on `dbo.Businesses` is a computed column: `replace(replace(replace(replace(replace([Phone],'(',''),')',''),'-',''),' ',''),'.','')`. It is never written directly.
- Never merge to `main` without explicit approval: a push to `main` deploys to production.
- No `Co-Authored-By` trailers. Conventional Commits for every subject.

## File Structure

| File | Responsibility |
|---|---|
| `vitest.config.ts` (create) | Unit test runner config, `node` environment, restricted to `src/lib` |
| `src/lib/leads.ts` (create) | Phone normalization, area-code derivation, blocklist classification, blocklist loading, single-lead import |
| `src/lib/leads.test.ts` (create) | Unit tests for the pure functions |
| `src/app/api/import/route.ts` (modify) | Becomes a thin caller: parse request, loop rows, format the response and email |
| `package.json` (modify) | Add `vitest` devDependency and a `test` script |

`loadBlocklists` and `importLead` touch Prisma and are deliberately thin, so the untested surface stays small. Everything with branching logic is pure and covered.

---

### Task 1: Add a unit test runner

The repository has `@playwright/test` for end-to-end specs and no unit runner at all, so there is nowhere to put the tests the next tasks need.

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Test: `src/lib/smoke.test.ts` (deleted at the end of this task)

**Interfaces:**
- Consumes: nothing.
- Produces: `pnpm test` runs Vitest over `src/**/*.test.ts`.

- [ ] **Step 1: Install Vitest**

```bash
cd /Users/cachomx/Projects/BCA/bca-platform
pnpm add -D vitest@^3
```

- [ ] **Step 2: Create the config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test that fails**

Create `src/lib/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest wiring', () => {
  it('runs and can fail', () => {
    expect(1 + 1).toBe(3);
  });
});
```

- [ ] **Step 5: Run it and confirm it fails**

Run: `pnpm test`
Expected: FAIL, `expected 2 to be 3`. A pass here means the runner is not picking up the file.

- [ ] **Step 6: Make it pass**

Change `toBe(3)` to `toBe(2)` in `src/lib/smoke.test.ts`.

- [ ] **Step 7: Run it and confirm it passes**

Run: `pnpm test`
Expected: PASS, 1 test.

- [ ] **Step 8: Delete the smoke test and commit**

```bash
rm src/lib/smoke.test.ts
git add vitest.config.ts package.json pnpm-lock.yaml
git commit -m "chore: add vitest for unit tests"
```

---

### Task 2: Extract the rules with behavior unchanged

The rules currently live inside the POST handler at `src/app/api/import/route.ts:7-17` (`cleanPhone`) and `:60-143` (blocklist loading, validation, dedup, insert). This task moves them without altering what they do. The known area-code bug is preserved here on purpose and fixed in Task 3, so that any behavior change is isolated to its own commit.

**Files:**
- Create: `src/lib/leads.ts`
- Create: `src/lib/leads.test.ts`
- Modify: `src/app/api/import/route.ts`

**Interfaces:**
- Consumes: `pnpm test` from Task 1.
- Produces:
  - `cleanPhone(phone: string): { formatted: string; digits: string }`
  - `areaCodeOf(digits: string): string`
  - `type RawLead = { businessName: string; phone: string; address: string; location: string; industry: string; timeZone: string }`
  - `type Blocklists = { keywords: string[]; areaCodes: Set<string> }`
  - `type Classification = { ok: true; formatted: string; digits: string } | { ok: false; reason: Rejection }`
  - `type Rejection = { kind: 'missing-name' } | { kind: 'missing-phone' } | { kind: 'invalid-phone'; phone: string } | { kind: 'blocked-area-code'; areaCode: string } | { kind: 'blocked-name'; keyword: string }`
  - `classifyLead(lead: RawLead, blocklists: Blocklists): Classification`
  - `describeRejection(reason: Rejection, rowNum: number, businessName: string): string`
  - `loadBlocklists(): Promise<Blocklists>`
  - `NEW_LEAD_STATUS: number` (the value `3`)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/leads.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cleanPhone, areaCodeOf, classifyLead, describeRejection, type RawLead, type Blocklists } from './leads';

const lead = (over: Partial<RawLead> = {}): RawLead => ({
  businessName: 'Acme Plumbing',
  phone: '(210) 555-1234',
  address: '1 Main St',
  location: 'San Antonio TX 78205',
  industry: 'Plumbing',
  timeZone: 'CST',
  ...over,
});

const lists = (over: Partial<Blocklists> = {}): Blocklists => ({
  keywords: [],
  areaCodes: new Set<string>(),
  ...over,
});

describe('cleanPhone', () => {
  it('formats ten digits', () => {
    expect(cleanPhone('2105551234')).toEqual({ formatted: '(210) 555-1234', digits: '2105551234' });
  });

  it('formats eleven digits starting with 1', () => {
    expect(cleanPhone('12105551234')).toEqual({ formatted: '+1 (210) 555-1234', digits: '12105551234' });
  });

  it('strips punctuation before formatting', () => {
    expect(cleanPhone('(210) 555-1234')).toEqual({ formatted: '(210) 555-1234', digits: '2105551234' });
  });

  it('leaves other lengths unformatted', () => {
    expect(cleanPhone('5551234')).toEqual({ formatted: '5551234', digits: '5551234' });
    expect(cleanPhone('21055512345')).toEqual({ formatted: '21055512345', digits: '21055512345' });
  });

  it('returns empty for input with no digits', () => {
    expect(cleanPhone('')).toEqual({ formatted: '', digits: '' });
    expect(cleanPhone('call us')).toEqual({ formatted: '', digits: '' });
  });

  it('treats an extension as trailing digits', () => {
    expect(cleanPhone('210-555-1234 x89')).toEqual({ formatted: '210555123489', digits: '210555123489' });
  });
});

describe('areaCodeOf', () => {
  it('reads the first three digits of a ten-digit number', () => {
    expect(areaCodeOf('2105551234')).toBe('210');
  });

  it('skips the country code on an eleven-digit number', () => {
    expect(areaCodeOf('12105551234')).toBe('210');
  });
});

describe('classifyLead', () => {
  it('accepts a valid lead', () => {
    expect(classifyLead(lead(), lists())).toEqual({ ok: true, formatted: '(210) 555-1234', digits: '2105551234' });
  });

  it('rejects a missing business name', () => {
    expect(classifyLead(lead({ businessName: '' }), lists())).toEqual({ ok: false, reason: { kind: 'missing-name' } });
  });

  it('rejects a missing phone', () => {
    expect(classifyLead(lead({ phone: '' }), lists())).toEqual({ ok: false, reason: { kind: 'missing-phone' } });
  });

  it('rejects a phone with fewer than ten digits', () => {
    expect(classifyLead(lead({ phone: '555-1234' }), lists())).toEqual({
      ok: false,
      reason: { kind: 'invalid-phone', phone: '555-1234' },
    });
  });

  it('rejects a blocked area code', () => {
    expect(classifyLead(lead(), lists({ areaCodes: new Set(['210']) }))).toEqual({
      ok: false,
      reason: { kind: 'blocked-area-code', areaCode: '210' },
    });
  });

  it('rejects a blocked name keyword, case-insensitively', () => {
    expect(classifyLead(lead({ businessName: 'ACME Plumbing' }), lists({ keywords: ['acme'] }))).toEqual({
      ok: false,
      reason: { kind: 'blocked-name', keyword: 'acme' },
    });
  });

  it('checks the name before the phone shape but after the area code', () => {
    const result = classifyLead(lead({ businessName: 'Acme' }), lists({ keywords: ['acme'], areaCodes: new Set(['210']) }));
    expect(result).toEqual({ ok: false, reason: { kind: 'blocked-area-code', areaCode: '210' } });
  });
});

describe('describeRejection', () => {
  it('matches the message the import route produced before extraction', () => {
    expect(describeRejection({ kind: 'missing-name' }, 4, '')).toBe('Row 4: Missing business name');
    expect(describeRejection({ kind: 'missing-phone' }, 4, 'Acme')).toBe('Row 4: Missing phone number');
    expect(describeRejection({ kind: 'invalid-phone', phone: '555' }, 4, 'Acme')).toBe('Row 4: Invalid phone number "555"');
    expect(describeRejection({ kind: 'blocked-area-code', areaCode: '210' }, 4, 'Acme')).toBe('Row 4: Blocked area code (210) — "Acme"');
    expect(describeRejection({ kind: 'blocked-name', keyword: 'acme' }, 4, 'Acme')).toBe('Row 4: Blocked business name keyword "acme" — "Acme"');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL, `Failed to resolve import "./leads"`.

- [ ] **Step 3: Write the module**

Create `src/lib/leads.ts`:

```ts
import { prisma } from '@/lib/prisma';

/** IdStatus for a lead that is ready to call. */
export const NEW_LEAD_STATUS = 3;

export type RawLead = {
  businessName: string;
  phone: string;
  address: string;
  location: string;
  industry: string;
  timeZone: string;
};

export type Blocklists = {
  keywords: string[];
  areaCodes: Set<string>;
};

export type Rejection =
  | { kind: 'missing-name' }
  | { kind: 'missing-phone' }
  | { kind: 'invalid-phone'; phone: string }
  | { kind: 'blocked-area-code'; areaCode: string }
  | { kind: 'blocked-name'; keyword: string };

export type Classification =
  | { ok: true; formatted: string; digits: string }
  | { ok: false; reason: Rejection };

export function cleanPhone(phone: string): { formatted: string; digits: string } {
  const digits = phone.replace(/\D/g, '');
  let formatted = digits;
  if (digits.length === 10) {
    formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    formatted = `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return { formatted, digits };
}

export function areaCodeOf(digits: string): string {
  return digits.length === 11 ? digits.slice(1, 4) : digits.slice(0, 3);
}

export function classifyLead(lead: RawLead, blocklists: Blocklists): Classification {
  if (!lead.businessName) return { ok: false, reason: { kind: 'missing-name' } };
  if (!lead.phone) return { ok: false, reason: { kind: 'missing-phone' } };

  const { formatted, digits } = cleanPhone(lead.phone);
  if (digits.length < 10) return { ok: false, reason: { kind: 'invalid-phone', phone: lead.phone } };

  const areaCode = areaCodeOf(digits);
  if (blocklists.areaCodes.has(areaCode)) {
    return { ok: false, reason: { kind: 'blocked-area-code', areaCode } };
  }

  const nameLower = lead.businessName.toLowerCase();
  const keyword = blocklists.keywords.find((kw) => nameLower.includes(kw));
  if (keyword) return { ok: false, reason: { kind: 'blocked-name', keyword } };

  return { ok: true, formatted, digits };
}

export function describeRejection(reason: Rejection, rowNum: number, businessName: string): string {
  switch (reason.kind) {
    case 'missing-name':
      return `Row ${rowNum}: Missing business name`;
    case 'missing-phone':
      return `Row ${rowNum}: Missing phone number`;
    case 'invalid-phone':
      return `Row ${rowNum}: Invalid phone number "${reason.phone}"`;
    case 'blocked-area-code':
      return `Row ${rowNum}: Blocked area code (${reason.areaCode}) — "${businessName}"`;
    case 'blocked-name':
      return `Row ${rowNum}: Blocked business name keyword "${reason.keyword}" — "${businessName}"`;
  }
}

export async function loadBlocklists(): Promise<Blocklists> {
  const [blockedNames, blockedAreaCodes] = await Promise.all([
    prisma.blockedName.findMany({ select: { keyword: true } }),
    prisma.blockedAreaCode.findMany({ select: { areaCode: true } }),
  ]);
  return {
    keywords: blockedNames.map((n) => n.keyword.toLowerCase()),
    areaCodes: new Set(blockedAreaCodes.map((c) => c.areaCode)),
  };
}

/**
 * Finds an existing business by normalized phone digits.
 * PhoneDigits is a computed column on SQL Server and is never written directly.
 */
export async function findByPhoneDigits(digits: string) {
  return prisma.business.findFirst({ where: { phoneDigits: digits } });
}

export async function createLead(lead: RawLead, formatted: string) {
  return prisma.business.create({
    data: {
      businessName: lead.businessName,
      phone: formatted,
      address: lead.address,
      location: lead.location,
      industry: lead.industry,
      timeZone: lead.timeZone,
      idStatus: NEW_LEAD_STATUS,
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS, 17 tests.

- [ ] **Step 5: Rewrite the import route to call the module**

In `src/app/api/import/route.ts`, delete the local `cleanPhone` (lines 7-17) and replace the import block at the top with:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { importValidateSchema } from '@/lib/validators';
import { buildImportSummaryEmailHTML, sendEmail } from '@/lib/email';
import {
  classifyLead,
  describeRejection,
  loadBlocklists,
  findByPhoneDigits,
  createLead,
  NEW_LEAD_STATUS,
  type RawLead,
} from '@/lib/leads';
import { prisma } from '@/lib/prisma';
```

Replace the blocklist-loading block (currently `const [blockedNames, blockedAreaCodes] = await Promise.all([...])` through `const blockedCodes = new Set(...)`) with:

```ts
    const blocklists = await loadBlocklists();
```

Replace the whole per-row body inside `for (let i = 0; i < data.length; i++) { ... }` with:

```ts
      const row = data[i];
      const rowNum = i + 1;

      try {
        const lead: RawLead = {
          businessName: row.businessName || row.BusinessName || '',
          phone: row.phone || row.Phone || '',
          address: row.address || row.Address || '',
          location: row.location || row.Location || '',
          industry: row.industry || row.Industry || '',
          timeZone: row.timeZone || row.TimeZone || row.timezone || '',
        };

        const verdict = classifyLead(lead, blocklists);
        if (!verdict.ok) {
          errors.push(describeRejection(verdict.reason, rowNum, lead.businessName));
          skipped++;
          continue;
        }

        const existing = await findByPhoneDigits(verdict.digits);
        if (existing) {
          errors.push(
            `Row ${rowNum}: Duplicate phone number "${lead.phone}" (business "${existing.businessName}")`,
          );
          skipped++;
          continue;
        }

        await createLead(lead, verdict.formatted);
        imported++;
      } catch (err) {
        errors.push(`Row ${rowNum}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        skipped++;
      }
```

Leave the summary counts, `businessesReadyToCall`, the email block, and the response untouched, but change the hardcoded status in the ready-to-call count to the constant:

```ts
    const businessesReadyToCall = await prisma.business.count({ where: { idStatus: NEW_LEAD_STATUS } });
```

- [ ] **Step 6: Verify the route still type-checks and the tests still pass**

Run: `pnpm test && pnpm lint && npx tsc --noEmit`
Expected: tests PASS, lint clean. `tsc` may report pre-existing errors elsewhere (the project sets `ignoreBuildErrors`), but nothing in `src/lib/leads.ts` or `src/app/api/import/route.ts`.

- [ ] **Step 7: Verify the import path by hand**

Run `pnpm dev`, sign in as a role-1 user, and upload a small CSV through `/admin/import` containing: one valid row, one with a blank name, one with a 7-digit phone, and one duplicate of a phone already in `Businesses`.
Expected: 1 imported, 3 skipped, and the four error strings identical in wording to what the route produced before this change.

- [ ] **Step 8: Commit**

```bash
git add src/lib/leads.ts src/lib/leads.test.ts src/app/api/import/route.ts
git commit -m "refactor(leads): extract import rules into a shared module"
```

---

### Task 3: Fix the area-code bug

`areaCodeOf` treats any 11-digit number as country-code-prefixed. For an 11-digit number that does not start with `1`, it reads the wrong three digits, so a blocked area code passes and an allowed one is rejected. The spec records this under "Known gaps in inherited logic". It ships separately from Task 2 so the extraction stays provably behavior-identical.

**Files:**
- Modify: `src/lib/leads.ts`
- Modify: `src/lib/leads.test.ts`

**Interfaces:**
- Consumes: `areaCodeOf` from Task 2.
- Produces: no signature change.

- [ ] **Step 1: Write the failing test**

Add to the `areaCodeOf` block in `src/lib/leads.test.ts`:

```ts
  it('does not skip a leading digit that is not a country code', () => {
    expect(areaCodeOf('25551234567')).toBe('255');
  });

  it('reads the last ten digits when extra digits are present', () => {
    expect(areaCodeOf('001210555123')).toBe('055');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test`
Expected: FAIL, `expected '555' to be '255'`.

- [ ] **Step 3: Fix the implementation**

In `src/lib/leads.ts`, replace `areaCodeOf`:

```ts
export function areaCodeOf(digits: string): string {
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return national.slice(-10, -7);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS, 19 tests. The two Task 2 area-code tests still pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/leads.ts src/lib/leads.test.ts
git commit -m "fix(leads): read the area code from the national number"
```

---

### Task 4: Open the pull request

**Files:** none.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: a PR for review. Do not merge; a push to `main` deploys to production.

- [ ] **Step 1: Confirm the branch is clean and rebased**

```bash
git status --short
git fetch origin && git rebase origin/main
pnpm test
```
Expected: clean tree, rebase without conflicts, tests pass.

- [ ] **Step 2: Push**

```bash
git push -u origin feat/extract-lead-rules
```

- [ ] **Step 3: Open the PR with a body file**

```bash
cat > /tmp/pr-body.md <<'EOF'
Extracts the lead validation rules from `/api/import` into `src/lib/leads.ts`
so the scraper ingest endpoint can call the same code rather than copying it.

Adds Vitest, which the repository did not have.

## Notes

`cleanPhone` was module-local and unexported, so "reuse the import logic" would
have meant a third copy of the phone rule (Python, TypeScript, TypeScript
again). This is step 1 of the automated lead scraping spec.

Task 2 is a behavior-preserving extraction. Task 3 then fixes one inherited
bug on its own: `areaCodeOf` treated every 11-digit number as
country-code-prefixed, so for `25551234567` it read `555` instead of `255`,
letting a blocked area code through.

## Test Plan

- `pnpm test` covers phone normalization, area-code derivation, blocklist
  classification, and the rejection messages, including the messages matching
  the strings the route produced before extraction.
- Manual: uploaded a CSV through `/admin/import` with one valid row, a blank
  name, a 7-digit phone, and a duplicate. Counts and error wording unchanged.

## Risk

Touches the live lead import path. Behavior is unchanged except the area-code
fix, which affects only 11-digit numbers not starting with 1.

## Rollback

Revert the merge commit. No schema or data changes.
EOF

gh pr create --title "refactor(leads): extract import rules into a shared module" --body-file /tmp/pr-body.md
```

- [ ] **Step 4: Report the PR URL and stop**

Do not merge. Report the URL and wait for approval.

---

## Self-Review

**Spec coverage.** This plan implements build-order step 1 in full: the extraction to `src/lib/leads.ts` with `/api/import` calling it, which the spec names as the prerequisite for the `results` endpoint. It also closes the area-code gap from "Known gaps in inherited logic". The second gap in that section, the `PhoneDigits` normalization disagreement, is not addressed here because it needs a schema decision and belongs with build-order step 2.

**Placeholders.** None. Every code step carries the code, every test step carries the assertions, and every run step carries the command and its expected output.

**Type consistency.** `RawLead`, `Blocklists`, `Rejection`, and `Classification` are defined once in Task 2 and used with the same field names in the route rewrite. `classifyLead` returns `{ ok, formatted, digits }` and the route consumes exactly those. `NEW_LEAD_STATUS` replaces the literal `3` in both the create path and the ready-to-call count.

**Known limitation.** `loadBlocklists`, `findByPhoneDigits`, and `createLead` have no automated coverage in this plan, since they need a database. They are deliberately thin wrappers with no branching. Their coverage arrives with the endpoint integration tests in Plan 4.
