# CLAUDE.md

Guidance for working in this repository (the **BCA / PulseBC** platform).

## Project overview

Internal web app for **Benjamin Chaise & Associates** (debt collection), branded
**PulseBC**. It replaced a legacy ASP.NET WebForms app (still archived on the
server under `/qa/old`). It handles call dispositions/leads, clients, time
clock, SMS, training videos, reports, and an admin area (users, permissions,
maintenance, quotes, rebuttals, blacklist, etc.).

- **Production:** https://yourdebtcollectors.com
- **QA / staging:** https://qa.yourdebtcollectors.com

## Tech stack

- **Next.js 16.1.6** (App Router, `output: 'standalone'`, **built with Turbopack**)
- **React 19**, TypeScript (build errors ignored via `next.config.ts`)
- **Prisma 6** ORM against **SQL Server** (`sqlserver://...`); `binaryTargets = ["native","windows"]`
- **NextAuth v5 (Auth.js)** credentials auth, `trustHost: true`, custom sign-in page `/login`
- **Tailwind CSS 4**, Radix UI, lucide-react, TanStack Query/Table, recharts
- **react-hook-form** for forms (inline validation; see `src/app/(dashboard)/calls/page.tsx`)
- **isomorphic-dompurify** for sanitizing rebuttal/call HTML (pulls `jsdom` server-side — see gotchas)
- Package manager: **pnpm** (but the production/QA servers run **`npm install`** — see Deployment)
- SendGrid (email) + an SMS gateway (sms-gate.app)

## Commands

```bash
pnpm install        # needs pnpm-workspace.yaml allowBuilds (see below)
pnpm build          # next build -> .next + .next/standalone
pnpm dev            # local dev server
pnpm lint           # eslint
node_modules/.bin/prisma generate   # regenerate Prisma client (native + windows engines)
```

`pnpm-workspace.yaml` must approve Prisma's build scripts or `pnpm install`
(and therefore `next build`'s dependency check) exits non-zero:

```yaml
allowBuilds:
  '@prisma/client': true
  '@prisma/engines': true
  prisma: true
  sharp: false
  unrs-resolver: false
```

## Architecture notes

- Routes live under `src/app/`: `(auth)` (login/register/reset), `(dashboard)`
  (calls, clients, clock, reports, sms, training, profile, admin/*), and `api/*`.
- **`src/lib/auth.ts`** configures NextAuth. **`src/middleware.ts`** gates routes:
  public routes allow through, unauthenticated users → `/login`, and per-route
  permissions are enforced from the JWT via `src/config/permission-keys.ts`.
  > NOTE: middleware previously hard-redirected any `qa.` host to prod — that
  > block was removed so the QA subdomain can run the app.
- DB access is via Prisma (`src/lib/prisma` / generated client). Schema in `prisma/schema.prisma`.

## Environments & hosting (IMPORTANT)

Both environments run on **one Windows server** (Plesk + IIS + **iisnode**),
sharing the **same SQL Server database** (`benjaise_BCA`).

| | Production | QA |
|---|---|---|
| URL | yourdebtcollectors.com | qa.yourdebtcollectors.com |
| Server path | `D:\...\httpdocs` (`/httpdocs` over FTP) | `D:\...\qa` (`/qa` over FTP) |
| Node runtime | manual **iisnode** (`web.config` + `iisnode-entry.js` + `server.js`) | **Plesk-managed Node.js** (startup file `app.js`) |
| node_modules | pre-existing on server (seeded once) | created on server via Plesk **NPM install** |

- **FTP:** host `192.185.7.4`, user `benjaise`. (The FTP password and all secret
  values now live ONLY in the server `.env` files — `/httpdocs/.env` and
  `/qa/.env`, retrievable over FTP — since the old deploy scripts that held them
  were untracked and have been deleted. **Rotate them and move to a secret store.**)
- **iisnode logs:** `/logs/iisnode/*.txt` (per-vhost, Plesk-managed). Read the
  newest `*-stderr-*.txt` to diagnose runtime crashes.
- Node on the server is **18.20.6**. Next 16 declares `engines.node >=20.9.0`
  (advisory warning only — it currently runs on 18).

## Deployment runbook

> **The #1 lesson:** the old deploy scripts only shipped `.next` and assumed the
> server's `node_modules` already matched the build. It often does **not** —
> production's `node_modules` is stale relative to the current lockfile, and a
> locally-built `.next` references module versions/paths that the stale
> `node_modules` can't resolve. Symptoms (HTTP 500, in `/logs/iisnode`):
> - `Failed to load external module @prisma/client-<hash>: Cannot find module ...`
> - `jsdom ... ERR_REQUIRE_ESM (@exodus/bytes / html-encoding-sniffer)`
> Also: a macOS-built `node_modules` has the wrong native binaries
> (`@next/swc-darwin-*`, mac Prisma engine) for the Windows server.

**Correct, reliable method (used to bring QA up):**

1. `pnpm build`, then copy `.next/static` into `.next/standalone/.next/static`
   (Next leaves static out of standalone).
2. Build a **single ZIP** of the app **without `node_modules`**: `.next` (skip
   `*.nft.json` and `*.map` — runtime-irrelevant), `public/`, `prisma/`
   (schema, for `prisma generate`), `package.json` (add `"postinstall":
   "prisma generate"`), the iisnode-compatible `server.js` (see below), the
   startup `app.js`, `web.config`, and the environment `.env`.
3. Upload the ZIP over FTP (one file ≈ 14 MB/s; thousands of small files are
   slow due to per-file overhead — **always zip + extract**).
4. In **Plesk File Manager**, extract into the target dir; in the **Node.js**
   panel run **NPM install** (installs correct Windows-native deps and runs
   `prisma generate`), then **Restart App**.

**`server.js` (iisnode-compatible)** — derive from the standalone `server.js`:
extract the `const nextConfig = {...}` object, then emit a server that does
`process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig)` and
boots `next({dev:false, dir:__dirname, conf:nextConfig})` on `process.env.PORT`.

**`app.js` / `iisnode-entry.js`** — the entry must load `.env` BEFORE requiring
`server.js`, and **strip surrounding quotes** from values (a quoted
`AUTH_URL="https://..."` otherwise reaches `new URL()` with literal quotes →
`ERR_INVALID_URL`). Set `process.env[k]=v` (override) so the `.env` wins over any
inherited env var.

**`web.config`** (manual iisnode, prod-style): an `iisnode` handler on the entry
file + a rewrite sending all non-file requests to it. Note: Plesk-managed Node
may regenerate/remove a hand-placed `web.config` on restart.

**Zero-downtime variant (staging + atomic swap)** — for prod, to avoid the
~20-min outage caused by overwriting a live `.next` in place: upload the new
build to `/httpdocs/.next_new` (app keeps serving the old `.next`), then FTP
`rename .next -> .next_old_<ts>` and `.next_new -> .next` (seconds), upload the
new `server.js`, and "touch" `web.config` to restart iisnode. Verify, and roll
back by renaming on failure. **This only fixes downtime — it does NOT fix the
`node_modules` mismatch above; still ensure deps match the build.**

## Build & runtime gotchas

- **Turbopack standalone externals**: `@prisma/client`, `jsdom`, etc. are
  externalized and `require()`d at runtime from `node_modules` — so deps MUST
  match the build (see runbook).
- **AUTH_URL per environment**: set `AUTH_URL=https://qa.yourdebtcollectors.com`
  for QA, prod URL for prod. With `trustHost:true` NextAuth can also infer host,
  but an inherited/wrong `AUTH_URL` causes redirects to the wrong domain.
- **Browsers cache 301s hard.** A permanent redirect served once (e.g. the old
  qa→prod middleware) sticks in the browser; test fixes in an incognito window.
- **Builds are largely reproducible** but `BUILD_ID` is random per build, and
  prerendered `.html`/`.rsc` embed it; a rebuild changes ~all hashed chunk names.
- The standalone app dir nests differently per build machine
  (`.next/standalone/` flat vs `.next/standalone/BenjaminChaise/bca-platform/`);
  the remote target (`/httpdocs`, `/qa`) is always flat.

## Required environment variables (`.env`)

Keys (values live ONLY in the server `.env` files now — `/httpdocs/.env` and
`/qa/.env` over FTP — rotate them):
`DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `AUTH_URL`, `SENDGRID_API_KEY`,
`SMS_API_URL`, `SMS_USERNAME`, `SMS_PASSWORD`, `SMS_DEVICE_ID`,
`SMS_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_NAME`, `NODE_ENV`,
`SCRAPER_API_SECRET`, `SCRAPE_ALERT_EMAIL`, `SCRAPE_DRY_RUN`.

> Every one of these must appear in **three** places or it is written empty
> on the next deploy: the repository secrets, the job `env:` block of
> `deploy.yml`, and its `env_lines` list. `deploy.yml` overwrites
> `/httpdocs/.env` wholesale on every push to `main`, so editing the file
> over FTP does not survive. `SMS_WEBHOOK_SECRET` was missing from the
> `env:` block until 2026-07-30, which left `/api/sms/webhook` running
> unauthenticated in production.

## Lead scraping prerequisites

Two SQL migrations must be applied **before** the matching app version
deploys, since this project runs migrations by hand:

- `prisma/migrations/20260730_businesses_phonedigits_unique.sql`
- `prisma/migrations/20260730_scrape_queue.sql`

Both were applied to `benjaise_BCA` on 2026-07-30. A fresh environment
also needs the catalog seeded, which reads the sibling Scraper repo:

```bash
node prisma/seed-scrape-catalog.mjs --source ../Scraper --apply
```

Without it `/admin/find-leads` renders no industries or states.

> SECURITY: secrets were hardcoded in plaintext in the old deploy scripts (now
> deleted) and still live in `.env` on the server. Rotate the DB password,
> AUTH_SECRET, SendGrid key, SMS creds, and FTP password, and keep `.env` out of
> version control.

## Housekeeping

- `.deploy-manifest.json` was the hash cache for the old incremental deployer; it
  is no longer used and can be deleted.
- Server leftovers from deploys/rollbacks can be removed once a release is
  confirmed: `/httpdocs/.next_bad_*`, `/httpdocs/.next_old_*`, and QA upload zips
  (`/qa/qa_app.zip`, `/qa/qa_next.zip`).
