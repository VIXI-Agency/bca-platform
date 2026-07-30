# Automated lead scraping

**Date:** 2026-07-29
**Status:** Approved design, not yet implemented

## Problem

Leads reach the platform through a manual chain: someone runs the Python
YellowPages scraper by hand, collects a CSV, then uploads it through
`/admin/import`. Nobody can see what territory has been covered, the same
industry and city get re-scraped without anyone noticing, and lead flow stops
whenever the person who runs the script is unavailable.

The goal is 1,000-2,000 new leads per day arriving without human action, with an
admin page to choose which industries and states to work through, and a daily
email reporting what came in.

## Constraints

These shaped the design and are not negotiable without revisiting it.

**The platform host cannot run the scraper.** bca-platform runs on Windows under
Plesk + IIS + iisnode with Node 18, deployed by FTP from GitHub Actions. iisnode
recycles worker processes, and a Next.js API route is the wrong place for a job
measured in hours.

**SQL Server is reachable from the internet on port 1433**, verified from an
unrelated host on 2026-07-29. That is a security finding in its own right and
should be restricted to known addresses. It does not change the design: the
worker still talks only to the platform over HTTPS, because the reason is
avoiding two divergent copies of the business rules, not network reachability.

**The search space is far larger than a single run.** 127 industries × 2,595
cities = 329,565 searches. At roughly 15s per search that is about 1,099 hours
of sequential work. Work must be queued and drained incrementally, never
attempted in one pass.

**Measured throughput:** 3 industry-city pairs at 3 pages each took 46s and
produced 270 listings, 239 unique. About 80 unique leads per pair, about 15s per
pair. A 1,500-lead day is therefore 5 minutes of work against a fresh database
and up to about 90 minutes once deduplication against existing rows starts
rejecting most results. Neither approaches the 6-hour GitHub Actions job limit.

**Business rules already exist and are in production.** `/api/import` normalizes
phones, rejects blocked area codes, rejects blocked business-name keywords,
deduplicates by `PhoneDigits`, inserts with `IdStatus = 3`, and emails a
summary. The design reuses that logic rather than reimplementing it.

## Verified against the live database

Checked against `benjaise_BCA` on 2026-07-29. These findings constrain the
design and were confirmed by query, not assumed.

**`Businesses_Dev` has no `PhoneDigits` column.** It holds 3,484,749 rows across
8 plain columns, none computed. `dbo.Businesses` holds about 3.50 million rows
and does have `PhoneDigits`. Any code that deduplicates by `PhoneDigits` must
detect the column's presence rather than assume it, because the two tables
differ.

**The `PhoneDigits` computed column does not strip all non-digits.** Its
definition is
`replace(replace(replace(replace(replace([Phone],'(',''),')',''),'-',''),' ',''),'.','')`,
which removes only five characters. A `+` or a letter survives into the value.
358 rows currently hold non-numeric `PhoneDigits`, all of them addresses that
landed in the `Phone` column during some earlier import. Python `clean_phone`
and TypeScript `cleanPhone` both use "strip every non-digit", so neither matches
this column exactly. Nothing breaks today because no row has a `Phone` starting
with `+`, but the mismatch is latent.

**10,824 duplicate phone groups already exist in `Businesses`**, each one a
surplus row. The cause is visible in the data: the same number stored in two
formats, such as `(202) 258-1937` and `(202) 2581937`. Both reduce to the same
`PhoneDigits`, so a digit-based check would have caught them. They were inserted
by the old scraper path, which compared the raw `Phone` string. This is the
historical cost of the bug that per-digit deduplication fixes.

**The scraper can return zero listings and report success.** Observed live: two
consecutive runs against the same URL, where the second fetched nothing while
the first and third returned 30 listings each. The run exited cleanly with
"0 unique" and never queried the database. This is why the zero-listing abort in
the error-handling section is required rather than defensive.

## Decisions

| Decision | Chosen | Rejected |
|---|---|---|
| Where the worker runs | Scheduled GitHub Actions | Separate VPS (cost, maintenance); the Windows host (adds Python to a Node-only server, no deploy automation) |
| Work selection | Admin queues a request, daily job drains it | Run-now-and-wait (unusable past a few hundred searches) |
| Who owns business rules | The platform, in one endpoint | The Python worker (two copies of the same rule, guaranteed to diverge) |
| Worker database access | None; HTTPS API only | Direct `pymssql` (requires exposing SQL Server to GitHub Actions IP ranges) |
| Permission key | Reuse `admin_import` | A new `admin_leads` key (Blacklist already reuses `admin_import`; same audience) |

## Architecture

```
Admin UI                SQL Server              GitHub Actions (cron)
─────────               ──────────              ─────────────────────
picks industries   →   ScrapeRequest      ←──   POST /api/scrape/lease
+ states               ScrapeTask (queue)        ↓
                                                worker.py
sees progress      ←   task status               ↓
                       Businesses         ←──   POST /api/scrape/results
daily email        ←   ScrapeRun          ←──   POST /api/scrape/finish
```

The worker holds no business rules and no configuration. It asks what to do,
fetches HTML, parses rows, and posts them back.

## Data model

Five tables in the `dbo` schema. Migrations are hand-written SQL in
`prisma/migrations/` plus a matching `schema.prisma` update, following the
existing convention in this repo (this project does not use Prisma Migrate).

### ScrapeIndustries

The 127 industry keywords, seeded from `keywords.csv`. Columns: `Id`, `Name`
(unique), `Active`. `Active` retires industries that stop producing leads
without deleting history.

### ScrapeCities

The 2,595 cities, seeded from `pst.csv`, `mst.csv`, `cst.csv`, `est.csv`.
Columns: `Id`, `City`, `State`, `TimeZone`, unique on `(City, State)`, indexed
on `State`.

All 2,595 source lines match the format `City ST`, yielding 36 distinct states,
and no state appears in more than one timezone file. State to timezone is
therefore a clean lookup derived at seed time, with no separate mapping table.
Note that 36 states is partial coverage of the US; expanding it means adding
rows to this table.

### ScrapeRequests

One admin request. Columns: `Id`, `CreatedBy`, `CreatedAt`, `Status`
(`active` | `paused` | `done` | `cancelled`), `MaxPages`.

**The daily lead target is global, not per request.** It is a worker environment
variable, `DAILY_TARGET` (default 1500), applied once across the whole run. Two
active requests do not add their targets together. Requests drain FIFO by
`CreatedAt`, and `paused` requests are skipped, so priority is expressed by
creation order rather than by competing per-request quotas.

### ScrapeTasks

The queue, and the center of the design. One row per industry-city pair in a
request.

Columns: `Id`, `IdRequest`, `Industry`, `City`, `State`, `TimeZone`, `Status`
(`pending` | `leased` | `done` | `failed`), `Attempts`, `LeasedAt`,
`CompletedAt`, `FoundCount`, `ImportedCount`, `LastError`. Indexed on
`(Status, IdRequest)` to serve leases, and on `IdRequest` for progress queries.

**Leasing with recovery.** The worker sets `Status = 'leased'` and `LeasedAt`.
Any task whose lease is older than 30 minutes returns to `pending` during the
next lease call. A GitHub runner that dies mid-job costs at most one batch, and
recovery needs no human action.

**Size warning.** 20 industries × 5 states is roughly 6,000 rows, which is
nothing. All 127 industries × all 36 states is 329,565 rows: valid, but 46 days
of work. The UI shows the row count and day estimate before the admin confirms.

### ScrapeRuns

One cron execution, holding the counters the daily email reports. Columns:
`Id`, `StartedAt`, `FinishedAt`, `TasksDone`, `LeadsFound`, `LeadsImported`,
`Duplicates`, `Blacklisted`, `Status`.

## API

Three routes under `/api/scrape/`, added to `publicRoutes` in
`src/middleware.ts`, authenticated by `Authorization: Bearer
$SCRAPER_API_SECRET`.

**Authentication fails closed.** If `SCRAPER_API_SECRET` is absent from the
environment, these routes return 503 and process nothing. This deliberately
differs from `/api/sms/webhook`, which wraps its check in
`if (WEBHOOK_SECRET)` and therefore skips authentication entirely when the
variable is unset. Do not copy that pattern here.

### POST /api/scrape/lease

Request: `{ limit: number, runId?: number }`
Response: `{ runId: number, tasks: [...] }`

Reclaims expired leases, selects `limit` `pending` tasks inside a transaction,
marks them `leased`, and returns them with `industry`, `city`, `state`,
`timeZone`, and the request's `maxPages`.

`runId` is how the worker and the server agree on which run they are in. The
first call of a job omits it, so the server opens a new `ScrapeRun` and returns
its id; every later call passes that id back and the server appends to the same
run. A call that passes an id for a run already marked finished is rejected.

The transaction is what makes concurrent leases safe: two callers can never
receive the same task.

### POST /api/scrape/results

Request: `{ runId, taskId, listings: [{ businessName, phone, address, location }] }`

Every business rule lives here, reusing the logic in
`src/app/api/import/route.ts`: normalize the phone through `cleanPhone`, reject
area codes in `BlockedAreaCodes`, reject names matching `BlockedNames`,
deduplicate against `PhoneDigits`, insert with `IdStatus = 3`.

Then marks the task `done`, records `FoundCount` and `ImportedCount`, adds to
the run counters, and returns `{ imported, duplicates, blacklisted }`.

Results post **per task, not batched at the end of the run.** A job that dies at
minute 40 keeps everything scraped up to that point, and those tasks are not
repeated.

### POST /api/scrape/finish

Request: `{ runId }`

Closes the run, marks as `done` any request whose tasks have all finished, and
sends the daily email.

## Worker

`Scrap.py` currently mixes fetching, parsing, orchestration, and output in about
350 lines. Splitting it is what allows two run modes without duplicated code:

| File | Responsibility |
|---|---|
| `scraper_core.py` | `fetch_page`, `search_url`, `parse_page`, `clean_phone`, proxy loading and rotation |
| `Scrap.py` | CSV mode, for manual and local runs |
| `worker.py` | Queue mode: lease, scrape, post, repeat |

The worker drops deduplication and blacklist filtering, which now belong to the
endpoint. It keeps within-batch deduplication so it does not post obvious
repeats.

It stops at whichever comes first: empty queue, `DAILY_TARGET` reached, or
`TIME_BUDGET_SECONDS` (default 4 hours, leaving 2 hours of headroom under the
GitHub Actions limit). It calls `finish` in all three cases.

## Scheduling and reporting

`.github/workflows/scrape.yml` in the Scraper repository:

```yaml
on:
  schedule: [{ cron: '0 8 * * *' }]   # ~3am ET
  workflow_dispatch:
concurrency:
  group: scrape                        # runs never overlap
```

Required GitHub secrets: `SCRAPER_API_SECRET`, `PLATFORM_API_URL`,
`WEBSHARE_API_KEY`, `WEBSHARE_RESIDENTIAL_PLAN`, `WEBSHARE_DOWNLOAD_TOKEN`, and
`PROXIES_FILE_CONTENT`.

`proxies.txt` holds 250 proxies with usernames and passwords in plaintext. It
goes in as a secret and is written to disk at runtime. It must never be
committed.

The daily email reuses the shell of `buildImportSummaryEmailHTML` through a thin
variant, `buildScrapeSummaryEmailHTML`, because the fields map almost directly
but `fileName` does not apply:

| Template field | Source |
|---|---|
| `totalRecords` | `ScrapeRun.LeadsFound` |
| `duplicatesFound` | `ScrapeRun.Duplicates` |
| `blackListBusinesses` | `ScrapeRun.Blacklisted` |
| `businessesImported` | `ScrapeRun.LeadsImported` |
| `businessesReadyToCall` | `count(IdStatus = 3)` |

Recipients stay as they are today: `support@benjaminchaise.com`,
`brianna@benjaminchaise.com`, `michael@benjaminchaise.com`.

## Admin UI

New page `/admin/find-leads`, with a navigation entry in
`src/config/navigation.ts` next to "Import Leads" using `permissionKey:
'admin_import'`.

**New request.** Searchable multi-select of industries (127), multi-select of
states (36), plus `MaxPages`. The daily target is global rather than a field on
this form, so the estimate below reads it as a constant. A live estimate renders
before the confirm button:

```
20 industries × 5 states (312 cities) = 6,240 searches
≈ 4 days at 1,500 leads/day
```

That estimate is the guard against queueing 46 days of work by accident.

**Active requests.** Progress bar (`done`/`total`), leads imported, estimated
completion date, and pause / resume / cancel. Pausing stops serving tasks from
that request without discarding completed work.

**Run history.** Recent `ScrapeRuns` with found, imported, duplicate, and
blacklisted counts.

Built on existing patterns: TanStack Query hooks in `src/hooks/`, Radix
components, and the card layout from `admin/import`.

## Error handling

| Failure | Response |
|---|---|
| Task fails (proxies exhausted, non-200) | `Attempts++`, return to `pending`. After 3 attempts, `failed` with `LastError`, surfaced in the UI. |
| Runner dies mid-job | Lease older than 30 minutes returns to `pending` on the next lease call. |
| Platform API unreachable | Worker retries with backoff, then exits non-zero so GitHub Actions reports the failure. |
| YellowPages changes its HTML | If the first 10 tasks of a run all return zero listings, abort the run and send an alert email. |

That last row is the one that matters most. Without it, a layout change produces
runs that report success with zero leads, potentially for weeks. The XPaths are
literal CSS class selectors (`div.v-card`, `div.phones.phone.primary`) and are
fragile by construction.

## Testing

**`scraper_core.py`**: unit tests for `clean_phone`, `search_url`, and
`parse_page` against a saved HTML fixture. That fixture is the regression test
for XPath drift.

**Endpoints**: integration tests over lease, results, and finish: rejection
without a token, 503 when no secret is configured, blacklist filtering,
`PhoneDigits` deduplication, and lease atomicity under concurrency.

**Phone parity**: the highest silent-failure risk in the design. Python
`clean_phone` and TypeScript `cleanPhone` must agree on every input; if they
drift, deduplication breaks and duplicates enter the database. A shared fixture
of input-to-expected-output cases, verified by both test suites.

The repository has `tests/e2e` with Playwright specs but no visible
`playwright.config`. The integration-test setup needs to be confirmed during
implementation.

## Build order

Each step leaves the system in a working state, and each one is verifiable
before the next begins.

1. **Tables and seed.** Migration SQL, `schema.prisma`, and a seed script that
   loads 127 industries and 2,595 cities from the existing CSVs. Verify by
   querying row counts and state grouping.
2. **Worker split.** Extract `scraper_core.py`; `Scrap.py` keeps working in CSV
   mode against it. Add the unit tests and the HTML fixture here. Nothing new
   ships yet, and the manual path is unchanged.
3. **Endpoints.** `lease`, `results`, `finish` with secret auth and integration
   tests. Testable with curl before any worker exists.
4. **`worker.py`.** Queue mode against the live endpoints. First real end-to-end
   run, triggered manually.
5. **Workflow.** Cron plus `workflow_dispatch`, secrets, concurrency group.
6. **Admin UI.** The page is last on purpose: by this point the pipeline already
   produces leads, so the UI is a view over working machinery rather than a
   guess about it.

Steps 1 through 5 deliver automated lead flow. Step 6 makes it self-service.

## Out of scope

- Sources other than YellowPages.
- Expanding coverage past the current 36 states.
- Retiring the manual `/admin/import` CSV path, which stays as it is.
- Migrating the worker to Scrapling's `ProxyRotator` or spider framework. The
  hand-rolled rotation in `scraper_core.py` works; changing it is a separate
  piece of work.

## Open items for implementation

1. Confirm the integration-test runner, given the missing `playwright.config`.
2. Decide the batch size for `lease`. Start at 25 and tune against observed
   runtime.
3. Rotate the Webshare tokens and proxy credentials before this ships. They are
   in the Scraper repository's git history.
