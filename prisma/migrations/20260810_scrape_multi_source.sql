-- Migration: a second lead source (SuperPages) alongside YellowPages
-- Run once against production DB before deploying the matching app version.

-- Background
--
-- The scraper's yield collapsed because the historical database came from
-- YellowPages in the first place: runs import about 0.34 new leads per search
-- while re-reading pages that are 93% businesses already on file. SuperPages is
-- the same company's second index of the same market, and a 50-search probe on
-- 2026-08-10 returned 2.2x the new businesses per listing on territory
-- YellowPages had already covered.
--
-- Everything here exists so the two sources do not contaminate each other's
-- coverage, counters or reporting.

-- ── Source on tasks ─────────────────────────────────────────────────────────
-- Existing rows are YellowPages, which is what the default records.
IF COL_LENGTH('dbo.ScrapeTasks', 'Source') IS NULL
BEGIN
  ALTER TABLE dbo.ScrapeTasks
    ADD Source NVARCHAR(10) NOT NULL CONSTRAINT DF_ScrapeTasks_Source DEFAULT 'yp';
END

-- ── Per-task rejection counters ─────────────────────────────────────────────
-- results/route.ts already computes duplicates, blacklisted and invalid per
-- task and then throws them into run-level increments. Keeping them per task is
-- what lets the daily report show a duplicate rate per source -- which is the
-- exact number the case for a second source rests on, and the one that says
-- when SuperPages has been absorbed and stops paying.
IF COL_LENGTH('dbo.ScrapeTasks', 'DuplicateCount') IS NULL
BEGIN
  ALTER TABLE dbo.ScrapeTasks ADD
    DuplicateCount   INT NULL,
    BlacklistedCount INT NULL,
    InvalidCount     INT NULL;
END

-- ── Source on leads ─────────────────────────────────────────────────────────
-- Nullable on purpose: the 1.49M rows that predate this genuinely have no
-- recorded source, and 'yp' would be a guess. NULL means "we do not know".
IF COL_LENGTH('dbo.Businesses', 'Source') IS NULL
BEGIN
  ALTER TABLE dbo.Businesses ADD Source NVARCHAR(10) NULL;
END

-- ── Coverage index ──────────────────────────────────────────────────────────
-- Source is a TRAILING key column. The coverage lookup filters
-- `Industry IN (...) AND State IN (...)`, so leading with a two-value column
-- would destroy that seek. The INCLUDE is what keeps the query covering; losing
-- it turns every candidate row into a key lookup across ~290,000 pending rows
-- plus all completed history.
IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.ScrapeTasks') AND name = 'IX_ScrapeTasks_Coverage'
)
BEGIN
  DROP INDEX IX_ScrapeTasks_Coverage ON dbo.ScrapeTasks;
END

EXEC('
  CREATE NONCLUSTERED INDEX IX_ScrapeTasks_Coverage
  ON dbo.ScrapeTasks (Industry, State, City, Source)
  INCLUDE (Status, CompletedAt);
');

-- ── Queue priority ──────────────────────────────────────────────────────────
-- lease orders strictly by CreatedAt. With ~290,000 YellowPages tasks pending
-- -- 50 to 70 days of work at current throughput -- a SuperPages request made
-- today would produce its first lead in October, which defers the only reason
-- to build any of this. Priority lets the queue be reordered without a second
-- migration, and 0 leaves every existing request exactly where it is.
IF COL_LENGTH('dbo.ScrapeRequests', 'Priority') IS NULL
BEGIN
  ALTER TABLE dbo.ScrapeRequests
    ADD Priority INT NOT NULL CONSTRAINT DF_ScrapeRequests_Priority DEFAULT 0;
END
