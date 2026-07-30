# Automated lead scraping

**Date:** 2026-07-29, revised 2026-07-30
**Status:** Approved design, not yet implemented

The revision follows an adversarial review of the first draft against the
codebase. It changed enough to be worth naming: the lease was not actually
atomic on SQL Server, there was no route by which a worker could report a failed
task, the admin routes were never designed, `cleanPhone` turned out not to be
exported, and the day estimates were wrong by roughly two orders of magnitude,
which in turn broke the "drain the backlog" framing the whole design rested on.

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

**Measured throughput:** 3 industry-city pairs at 3 pages each took 46s and
produced 270 listings, 239 unique. That is about 80 unique leads per pair and
about 15s per pair.

**The queue never drains, and the design must not pretend otherwise.** 127
industries × 2,595 cities = 329,565 searches, which at 15s each is 1,373 hours
of sequential fetching. But fetch time is not the binding constraint. At
`DAILY_TARGET` = 1,500 leads and roughly 80 fresh leads per search, the daily
quota is spent after about **19 searches**, well before the 4-hour time budget
allows its ~960. The full space is therefore decades of work at this target, and
no admin request of realistic size ever completes.

Two consequences follow, and both shape the design:

1. **Order matters, completion does not.** The queue is effectively infinite, so
   the question worth answering is "which industry and city do we scrape next,"
   never "when are we done." Progress bars should read as leads delivered, not
   as percent of a request finished.
2. **Yield decays, so the search-per-lead ratio is not stable.** 80 leads per
   search holds against a fresh database. Once a territory is covered,
   deduplication rejects most results and the same 1,500 leads cost far more
   searches. The daily job must be bounded by both leads and time, because
   whichever binds changes as coverage grows.

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
| Work selection | Admin queues a request, daily job works through it in priority order | Run-now-and-wait (unusable past a few hundred searches); promising completion (the queue never drains) |
| Who owns business rules | The platform, in `src/lib/leads.ts`, called by both `/api/import` and the worker endpoint | The Python worker, or copy-pasting out of the import route (either way, two copies of the same rule) |
| Lease concurrency | Single `UPDATE ... OUTPUT` with `UPDLOCK, READPAST` via `$queryRaw` | `SELECT` then `UPDATE` in a transaction (does not prevent double-lease under READ COMMITTED) |
| Task failure reporting | A dedicated `worker/fail` route | Posting empty `listings` to `results` (records a fetch failure as an empty city, permanently) |
| Worker database access | None; HTTPS API only | Direct `pymssql` (requires exposing SQL Server to GitHub Actions IP ranges) |
| Permission key | Reuse `admin_import` | A new `admin_leads` key (Blacklist already reuses `admin_import`; same audience) |

## Architecture

```
Admin UI                SQL Server              GitHub Actions (cron)
─────────               ──────────              ─────────────────────
picks industries   →   ScrapeRequest      ←──   POST /api/scrape/worker/lease
+ states               ScrapeTask (queue)        ↓
                                                worker.py
sees progress      ←   task status               ↓
                       Businesses         ←──   POST /api/scrape/worker/results
failed tasks       ←   ScrapeTask         ←──   POST /api/scrape/worker/fail
daily email        ←   ScrapeRun          ←──   POST /api/scrape/worker/finish
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

Setting `Active` correctly needs data the per-run history does not provide, so
the Admin UI includes a yield view: `ImportedCount` summed over `ScrapeTasks`
grouped by `Industry`, alongside the task count. Without it nobody can answer
which industries stopped producing, and the flag never gets used.

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

Columns: `Id`, `IdRequest`, `IdRun`, `Industry`, `City`, `State`, `TimeZone`,
`Status` (`pending` | `leased` | `done` | `failed`), `Attempts`, `LeasedAt`,
`CompletedAt`, `FoundCount`, `ImportedCount`, `LastError`. Indexed on
`(Status, IdRequest)` to serve leases, and on `IdRequest` for progress queries.

`IdRun` records which run completed the task. Without it a task reclaimed from
an expired lease and finished in a later run is indistinguishable from one
finished in the original, and the per-run counters cannot be reconciled against
`Businesses`.

**Leasing with recovery.** The worker sets `Status = 'leased'` and `LeasedAt`.
Any task whose lease is older than 30 minutes returns to `pending` during the
next lease call. A GitHub runner that dies mid-job costs at most one batch, and
recovery needs no human action.

**`LeasedAt` is UTC, written by the application, never by `GETDATE()`.** Prisma
writes `DateTime` as UTC while SQL Server's `GETDATE()` returns server-local
time, and this repo mixes both conventions (`import/route.ts` formats report
dates in `America/Chicago`). A 30-minute expiry compared against a value 5 or 6
hours off would treat every leased task as expired and hand the same rows to the
same worker on every call. Use `datetime2` with the value supplied by the
application, and no column default.

**Reclaiming an expired lease increments `Attempts`.** Otherwise a task that
reliably kills the worker is leased, abandoned, reclaimed, and leased again
forever, never reaching `failed` and never surfacing in the UI.

**Global coverage lives here, not only per request.** A unique index on
`(Industry, City)` filtered to non-cancelled requests stops a second overlapping
request from re-queueing territory the first already covered. Without it the
design does not solve the second problem in the Problem statement, since
coverage would exist only inside per-request rows. Requests reuse existing task
rows where they overlap rather than duplicating them.

**Size.** 20 industries × 5 states is roughly 6,000 rows; all 127 industries ×
all 36 states is 329,565. Both are fine for SQL Server. What the UI must show
before confirming is not a completion date, which per the Constraints section is
decades away, but the count of newly queued pairs and the current delivery rate
in leads per day.

### ScrapeRuns

One cron execution, holding the counters the daily email reports. Columns:
`Id`, `StartedAt`, `FinishedAt`, `TasksDone`, `LeadsFound`, `LeadsImported`,
`Duplicates`, `Blacklisted`, `Status`, `FinishReason`.

### Changes to existing tables

**Done on 2026-07-30.** Recorded in
`prisma/migrations/20260730_businesses_phonedigits_unique.sql`.

Deduplication was a read-then-write check (`findFirst` then `create`) with no
constraint behind it. That was adequate for one person uploading a CSV at a
time. Under concurrent `results` posts it is not: a chain business listed in two
adjacent cities, leased in the same batch, passes both checks and inserts twice.
`UX_Businesses_PhoneDigits` is what makes "deduplicate against `PhoneDigits`" a
guarantee rather than a hope.

The 10,824 duplicate groups were merged first, since a unique index cannot be
created over them. Merged rather than deleted: `Calls.IdBusiness` is
`NO_ACTION` and 3,898 of the rows carried call history, so a straight delete
would have failed. Calls were repointed to the survivor and its `IdStatus`
promoted to the most advanced of the pair, which kept 680 already-called leads
out of the calling queue.

An earlier draft of this section was wrong on two counts, both corrected by
checking the server rather than `schema.prisma`:

- `PhoneDigits` is **already** `PERSISTED`, deterministic, precise, and
  indexable. No `ALTER TABLE` was needed.
- `IX_Businesses_PhoneDigits` **already existed**, keyed on `PhoneDigits` with
  `INCLUDE (IdBusiness, BusinessName, Phone, IdStatus)`. It covers the dedup
  query exactly. The claim that every check scanned 3.5 million rows was false,
  and the comment at `src/app/api/businesses/route.ts:56` asserting the index
  exists was correct. What was missing was the index's presence in version
  control, which the migration now supplies.

The unique index is unfiltered: SQL Server rejects a computed column inside a
filter expression. That is viable because `PhoneDigits` has no NULLs and exactly
one empty value.

## API

Two families of routes, with different callers and different authentication.

**Machine routes** under `/api/scrape/worker/`, called by the GitHub Actions
worker, authenticated by `Authorization: Bearer $SCRAPER_API_SECRET`:
`lease`, `results`, `fail`, `finish`.

**Admin routes** under `/api/scrape/requests/`, called by the browser,
authenticated by the existing NextAuth session. These do not exist in the
earlier draft of this design and the Admin UI cannot function without them:
`POST` creates a request, `PATCH /:id` pauses or resumes, `DELETE /:id`
cancels.

### Authentication

**Only the four machine routes are exempt from NextAuth, and they must be listed
by exact path.** `publicRoutes` in `src/middleware.ts:5` is matched with
`pathname.startsWith(route)`, so adding the prefix `/api/scrape` would open
every present and future sibling route, including the admin ones. An anonymous
`POST /api/scrape/requests` would let anyone queue 329,565 rows or cancel a
running campaign.

**Machine authentication fails closed.** If `SCRAPER_API_SECRET` is absent from
the environment, these routes return 503 and process nothing. Compare with
`crypto.timingSafeEqual`, not `===`. Rate-limit per IP, since a leaked secret is
otherwise an unauthenticated write path into `Businesses` that also triggers
outbound email, with none of the CSV audit trail `/api/import` leaves behind.

This deliberately differs from `/api/sms/webhook`, which wraps its check in
`if (WEBHOOK_SECRET)` and skips authentication entirely when the variable is
unset. That is not a hypothetical: `SMS_WEBHOOK_SECRET` is absent from the
`env:` block of `.github/workflows/deploy.yml` while still being written by
`env_lines`, so every deploy writes it empty and that webhook is currently
unauthenticated in production. Fix that separately; do not copy the pattern.

**Admin routes check the role, not just the permission key.** Authorization in
this codebase is `if (role !== 1)` inside each handler
(`src/app/api/import/route.ts:36`). The permission key controls menu visibility
and middleware routing, nothing more.

### POST /api/scrape/worker/lease

Request: `{ limit: number, runId?: number }`
Response: `{ runId: number, tasks: [...] }`

Reclaims expired leases, selects `limit` `pending` tasks, marks them `leased`,
and returns them with `industry`, `city`, `state`, `timeZone`, and the request's
`maxPages`.

`runId` is how the worker and the server agree on which run they are in. The
first call of a job omits it, so the server opens a new `ScrapeRun` and returns
its id; every later call passes that id back and the server appends to the same
run. A call that passes an id for a run already marked finished is rejected.

**The lease must be a single `UPDATE ... OUTPUT` statement with locking hints.**
Wrapping a `SELECT` and an `UPDATE` in a transaction does not make the lease
safe on SQL Server. Under the default READ COMMITTED, shared locks are released
as each row is read, so two callers can select the same rows; with
`READ_COMMITTED_SNAPSHOT ON` readers never block and double-lease is certain
rather than merely likely. The alternative outcome is the classic queue-table
deadlock as shared locks convert to update locks.

```sql
UPDATE t SET Status = 'leased', LeasedAt = @now, IdRun = @runId
OUTPUT inserted.Id, inserted.Industry, inserted.City, inserted.State, inserted.TimeZone
FROM (
  SELECT TOP (@limit) * FROM ScrapeTasks WITH (ROWLOCK, UPDLOCK, READPAST)
  WHERE Status = 'pending' ORDER BY Id
) t
```

`READPAST` skips rows another worker already holds instead of blocking on them.
Prisma cannot express table hints, so this runs through `$queryRaw`. Note also
that `prisma.$transaction` interactive transactions default to a 5-second
timeout, which the reclaim-plus-lease sequence can exceed on a large table.

### POST /api/scrape/worker/results

Request: `{ runId, taskId, listings: [{ businessName, phone, address, location }] }`

Every business rule lives here, calling the shared module extracted from
`src/app/api/import/route.ts` (see Build order step 1): normalize the phone,
reject area codes in `BlockedAreaCodes`, reject names matching `BlockedNames`,
deduplicate against `PhoneDigits`, insert with `IdStatus = 3`.

Then marks the task `done`, records `FoundCount` and `ImportedCount`, adds to
the run counters, and returns `{ imported, duplicates, blacklisted }`.

**Idempotent by task.** A task already `done` returns its stored counts and
changes nothing. Without this, a worker that posts successfully but loses the
response before its retry double-counts `Duplicates`, `ImportedCount`, and
`ScrapeRun.LeadsFound`, and the daily email reports numbers that cannot be
reconciled against `Businesses`.

Results post **per task, not batched at the end of the run.** A job that dies at
minute 40 keeps everything scraped up to that point, and those tasks are not
repeated.

### POST /api/scrape/worker/fail

Request: `{ runId, taskId, error: string }`

Increments `Attempts`, stores `LastError`, and returns the task to `pending`.
At 3 attempts it becomes `failed` and surfaces in the UI.

This route is what makes the error-handling table achievable. Without it the
worker has no way to distinguish "this city genuinely has no plumbers" from
"all 250 proxies were blocked," and posting an empty `listings` array to
`results` would permanently record the second as the first.

### POST /api/scrape/worker/finish

Request: `{ runId, reason: 'empty' | 'target' | 'budget' | 'drift' }`

Closes the run, marks as `done` any request whose tasks have all finished, and
sends mail conditioned on `reason`:

| `reason` | Mail |
|---|---|
| `target`, `budget` | The daily summary. |
| `empty` | A "queue drained, nothing left to scrape" notice, not an all-zeros summary. |
| `drift` | An alert to the technical owner, separate from the daily summary. |

Distinguishing these matters because a run that finds nothing looks identical to
a healthy run in the summary template. Recipients who receive all-zeros mail
daily stop reading it, which is also how the drift alert gets ignored.

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

Per task it calls exactly one of two routes. `results` when the fetch succeeded,
including when the city legitimately has no listings. `fail` when it could not
fetch at all, which is the only place that distinction is knowable.

It stops at whichever comes first, and reports which to `finish`:

| Stop condition | `reason` |
|---|---|
| `DAILY_TARGET` leads reached | `target` |
| `TIME_BUDGET_SECONDS` elapsed (default 4h, 2h of headroom under the GitHub Actions limit) | `budget` |
| Queue returned no pending tasks | `empty` |
| First 10 tasks all returned zero listings | `drift` |

## Scheduling and reporting

`.github/workflows/scrape.yml` in the Scraper repository:

```yaml
on:
  schedule: [{ cron: '0 7 * * *' }]   # 07:00 UTC = 3am EDT, 2am EST
  workflow_dispatch:
concurrency:
  group: scrape                        # runs never overlap
```

GitHub Actions cron is UTC and does not follow daylight saving, so any single
value drifts an hour across the year. 07:00 UTC keeps the run overnight in
Eastern time year-round.

Required GitHub secrets in the Scraper repository: `SCRAPER_API_SECRET`,
`PLATFORM_API_URL`, `WEBSHARE_API_KEY`, `WEBSHARE_RESIDENTIAL_PLAN`,
`WEBSHARE_DOWNLOAD_TOKEN`, and `PROXIES_FILE_CONTENT`.

`proxies.txt` holds 250 proxies with usernames and passwords in plaintext. It
goes in as a secret and is written to disk at runtime. It is already in
`.gitignore` and has never been committed; keep it that way.

**`SCRAPER_API_SECRET` needs three separate additions on the platform side, and
missing any one of them silently stops the pipeline.** `deploy.yml` overwrites
`/httpdocs/.env` on every push to `main` from a hardcoded list, so the value must
be added to (1) the repository secrets, (2) the job's `env:` block, and (3)
`env_lines`. Add it to `.env.example` and the required-variables list in
`CLAUDE.md` as well. Skip step 2 and the variable is written empty on the next
unrelated deploy, the routes start returning 503 per the fail-closed rule, and
nothing on the platform side alerts. This is exactly how `SMS_WEBHOOK_SECRET`
came to be empty in production.

### Daily email

`buildImportSummaryEmailHTML` cannot be reused as-is. Its body copy is hardcoded
for manual CSV imports (`src/lib/email.ts:140-142`): it greets Brianna and Ford
by name, states that `${importedBy}` "just imported new Businesses," and refers
to an attached CSV. For an automated run there is no importer and no attachment,
so two of its three sentences are false. `ImportSummaryEmailData` also types
`fileName` as required.

`buildScrapeSummaryEmailHTML` therefore shares the outer shell and stat blocks
but takes its own copy and its own type:

| Template field | Source |
|---|---|
| `totalRecords` | `ScrapeRun.LeadsFound` |
| `duplicatesFound` | `ScrapeRun.Duplicates` |
| `blackListBusinesses` | `ScrapeRun.Blacklisted` |
| `businessesImported` | `ScrapeRun.LeadsImported` |
| `businessesReadyToCall` | `count(IdStatus = 3)` |
| `reportDate` | `ScrapeRun.FinishedAt`, formatted `America/Chicago` |
| `searchesRun` | `ScrapeRun.TasksDone` |

Recipients stay as they are today: `support@benjaminchaise.com`,
`brianna@benjaminchaise.com`, `michael@benjaminchaise.com`. Drift alerts go to
the technical owner instead, since they need action rather than awareness.

## Admin UI

New page `/admin/find-leads`, with a navigation entry in
`src/config/navigation.ts` next to "Import Leads" using `permissionKey:
'admin_import'`.

**The nav entry does not protect the page.** Enforcement lives in
`getPermissionKeyForRoute` and `getPermissionKeyForApiRoute` in
`src/config/permission-keys.ts`, and both need a `/admin/find-leads` and
`/api/scrape/requests` branch added. Without them any authenticated user who
types the URL loads the page. The Blacklist entry this design copies has exactly
this hole today: it declares `permissionKey: 'admin_import'` in
`navigation.ts:127-131` with no matching route branch. Do not copy it; fix the
new page and note the existing gap separately.

**New request.** Searchable multi-select of industries (127), multi-select of
states (36), plus `MaxPages`. The daily target is global rather than a field on
this form. The confirm step shows what is actually decision-relevant:

```
20 industries × 5 states (312 cities) = 6,240 searches queued
4,100 are new; 2,140 already covered by an earlier request
current delivery: ~1,500 leads/day
```

Deliberately absent is a completion date. Per the Constraints section the queue
never drains, so any such estimate would be both wrong and misleading. What the
admin needs to know is how much of the selection is new territory.

**Active requests.** Leads delivered, searches completed, share of the request
still unqueued, and pause / resume / cancel. Pausing stops serving tasks from
that request without discarding completed work. No percent-complete bar, for the
same reason.

**Run history.** Recent `ScrapeRuns` with found, imported, duplicate, and
blacklisted counts, plus `FinishReason` so an operator can tell a healthy run
from a drained queue at a glance.

**Failed tasks.** Tasks at `failed` with their `LastError`, and a retry action
that returns them to `pending`. Without this view the `fail` endpoint's work is
invisible.

Built on existing patterns: TanStack Query hooks in `src/hooks/`, Radix
components, and the card layout from `admin/import`.

## Error handling

| Failure | Response |
|---|---|
| Task fails (proxies exhausted, non-200) | Worker calls `worker/fail`. `Attempts++`, back to `pending`. At 3 attempts, `failed` with `LastError`, surfaced in the UI. |
| Runner dies mid-job | Lease older than 30 minutes returns to `pending` on the next lease call, incrementing `Attempts` so a poison task cannot loop forever. |
| Platform API unreachable | Worker retries with backoff, then exits non-zero so GitHub Actions reports the failure. |
| YellowPages changes its HTML | If the first 10 tasks of a run all return zero listings, call `worker/finish` with `reason: 'drift'`, which alerts and leaves those tasks `pending`. |

Two distinctions carry most of the weight here.

**Zero listings is not the same as task success.** A genuinely empty city and a
city where all 250 proxies were blocked look identical in the response. Only the
worker knows which happened, so it must call `fail` rather than post an empty
`results`. Posting empty results marks the task `done` and permanently records
"this city has no plumbers."

**Drift aborts must not consume tasks.** The 10 tasks that triggered the alert
stay `pending`, or a layout change silently burns 10 industry-city pairs per day
while reporting an alert nobody acts on. This failure mode is not theoretical:
during testing, two consecutive runs against an identical URL returned 30
listings and then 0, with the second exiting cleanly.

## Testing

**`scraper_core.py`**: unit tests for `clean_phone`, `search_url`, and
`parse_page` against a saved HTML fixture. That fixture is the regression test
for XPath drift.

**Endpoints**: integration tests over lease, results, fail, and finish. Rejection
without a token, 503 when no secret is configured, session-and-role rejection on
the admin routes, blacklist filtering, `PhoneDigits` deduplication, idempotent
re-post of a completed task, and `FinishReason` routing to the right mail.

**Lease atomicity**: the one test most likely to be written so it passes
vacuously. It has to run genuinely concurrent lease calls against a seeded queue
and assert that the union of returned task ids has no repeats. A sequential
test proves nothing about READ COMMITTED.

**Phone normalization** is checked against the database, not only across
languages. The dedup key is the SQL Server computed column `PhoneDigits`, whose
definition strips only `(`, `)`, `-`, space, and `.`, while both `clean_phone`
and `cleanPhone` strip every non-digit. A shared fixture of input-to-expected
cases should be verified by the Python suite, the TypeScript suite, **and** a
query that round-trips the value through the column.

The repository has `tests/e2e` with Playwright specs but no visible
`playwright.config`. The integration-test setup needs to be confirmed during
implementation.

## Build order

Each step leaves the system in a working state, and each one is verifiable
before the next begins.

1. **Extract the lead rules.** DONE, PR #2. Moved out of
   `src/app/api/import/route.ts` into `src/lib/leads.ts` (pure rules, no Prisma
   import) and `src/lib/leads-db.ts` (the three queries), with `/api/import`
   calling them. The split was not in the original plan: importing Prisma at
   module scope made the rules untestable without a database, which defeated the
   point of extracting them. Vitest was added, since the repository had no unit
   runner. `areaCodeOf` was fixed in its own commit.
   Verified by the existing import path behaving identically.
2. **Index and duplicates.** DONE, PR #3. The 10,824 groups were merged and
   `UX_Businesses_PhoneDigits` created. `PERSISTED` turned out to be already set
   and the covering index already present; see Changes to existing tables.
3. **Tables and seed.** Migration SQL, `schema.prisma`, and a seed script that
   loads 127 industries and 2,595 cities from the existing CSVs. Verify by
   querying row counts and state grouping.
4. **Worker split.** Extract `scraper_core.py`; `Scrap.py` keeps working in CSV
   mode against it. Add the unit tests and the HTML fixture here. Nothing new
   ships yet, and the manual path is unchanged.
5. **Machine endpoints.** `lease`, `results`, `fail`, `finish` with secret auth
   and integration tests. Testable with curl before any worker exists.
6. **`worker.py`.** Queue mode against the live endpoints. First real end-to-end
   run, triggered manually, against a queue seeded with a handful of tasks and
   `SCRAPE_DRY_RUN` set (see below).
7. **Workflow.** Cron plus `workflow_dispatch`, secrets, concurrency group.
8. **Admin routes and UI.** The page is last on purpose: by this point the
   pipeline already produces leads, so the UI is a view over working machinery
   rather than a guess about it.

Steps 1 through 7 deliver automated lead flow. Step 8 makes it self-service.

### There is no separate database to test against

Per `CLAUDE.md`, production and QA run on one server and share one SQL Server
database, `benjaise_BCA`. Step 6 therefore writes real rows into `Businesses`
and triggers real mail to three people, whichever environment it points at.

Two mitigations, both required before the first end-to-end run:

- A `SCRAPE_DRY_RUN` flag on the platform, which makes `results` run every rule
  and return real counts without inserting, and makes `finish` skip mail.
- The first live run limited to a queue seeded with a handful of tasks, and
  triggered manually rather than by cron.

The scraper's own `DB_TABLE` switch between `Businesses` and `Businesses_Dev`
does not help here. The `results` endpoint writes through Prisma's `Business`
model, which is hardcoded to `@@map("Businesses")`.

## Out of scope

- Sources other than YellowPages.
- Expanding coverage past the current 36 states.
- Retiring the manual `/admin/import` CSV path, which stays as it is.
- Migrating the worker to Scrapling's `ProxyRotator` or spider framework. The
  hand-rolled rotation in `scraper_core.py` works; changing it is a separate
  piece of work.
- Repairing the 7,704 `Businesses_Dev` rows with `IdStatus = 5`, left as they
  are by decision.
- Fixing the unauthenticated `/api/sms/webhook` in production. Unrelated to this
  work and more urgent than it; track separately.

## Known gaps in inherited logic

The rules moved into `src/lib/leads.ts` in step 1 are adopted as-is, but two of
them are wrong and will now run at 1,500 rows/day instead of occasional manual
imports.

**The area-code check misreads 11-digit numbers that do not start with 1.**
`src/app/api/import/route.ts:104` reads `digits.length === 11 ? digits.slice(1,4)
: digits.slice(0,3)`. For `25551234567` that yields `555` rather than `255`, so a
blocked `255` passes and an allowed `555` is rejected.

**`PhoneDigits` and the application disagree on normalization.** The column
strips five characters; the application strips every non-digit. No row currently
has a `Phone` starting with `+`, so nothing breaks today, but `cleanPhone`
formats 11-digit numbers as `+1 (XXX) XXX-XXXX`. The first such lead stored
makes its `PhoneDigits` `+1XXXXXXXXXX` and permanently invisible to dedup.
Either extend the column definition or stop emitting the `+` prefix.

## Cost and rate limits

Not addressed by this design, and needed before the first unattended run.

No cap exists on requests per hour to yellowpages.com, and 1,500 leads/day is a
sustained crawl rather than the occasional manual run the current code was built
for. `scraper_core.py` walks all 250 datacenter proxies and then the entire
residential list per URL, and Webshare residential bandwidth is metered by the
gigabyte. The fallback engages precisely when datacenter proxies are being
blocked, so cost spikes exactly when things are going wrong. Decide a per-run
request ceiling, a residential-bandwidth budget, and an alert on proxy
exhaustion.

## Open items for implementation

1. Confirm the integration-test runner, given the missing `playwright.config`.
2. Decide the batch size for `lease`. Start at 25 and tune against observed
   runtime.
3. Rotate the three Webshare credentials that were hardcoded as defaults in
   `Scrap.py` and are visible in that repository's history:
   `WEBSHARE_API_KEY`, `WEBSHARE_DOWNLOAD_TOKEN`, `WEBSHARE_RESIDENTIAL_PLAN`.
   `proxies.txt` was never committed and needs no rotation on that account.
4. Restrict SQL Server port 1433, currently reachable from any internet host.
5. `Call.idBusiness` is declared non-nullable `Int` in `schema.prisma`, but two
   rows from December 2024 hold NULL. Schema drift, found while verifying the
   merge. Decide whether to make the field optional or repair the rows.
