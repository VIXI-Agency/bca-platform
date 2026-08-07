-- Migration: let a scraped industry+city be scraped again once it goes stale
-- Run once against production DB before deploying the matching app version.

-- Background
--
-- UX_ScrapeTasks_Coverage made coverage permanent: one row per industry+city+
-- state, ever. It was the right guard against two overlapping requests
-- re-scraping the same territory, but it also made the scraper a one-shot tool.
-- YellowPages gains businesses continuously, so the same search run four months
-- later returns businesses that did not exist the first time -- and there was no
-- way to ask for it. Once the catalog was exhausted the worker had nothing left
-- to do, permanently.
--
-- Coverage becomes time-bounded instead: a pair is covered while a task for it
-- is queued or was completed inside the window (COVERAGE_TTL_DAYS in
-- src/app/api/scrape/requests/route.ts), and becomes available again after
-- that. Enforcing it in the request handler rather than the schema is what
-- allows the same pair to hold several rows across time -- which is also the
-- history of when that city was last looked at.
--
-- A failed task no longer blocks anything. It never blocked coverage, but the
-- unique index still refused a second row, so a pair that lost its three
-- attempts to a proxy outage could only return through the manual retry view.

IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.ScrapeTasks') AND name = 'UX_ScrapeTasks_Coverage'
)
BEGIN
  DROP INDEX UX_ScrapeTasks_Coverage ON dbo.ScrapeTasks;
END

-- Replaces it non-uniquely. The coverage lookup filters by industry and state
-- and then reads CompletedAt, so all four columns belong in the key.
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.ScrapeTasks') AND name = 'IX_ScrapeTasks_Coverage'
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_ScrapeTasks_Coverage
  ON dbo.ScrapeTasks (Industry, State, City)
  INCLUDE (Status, CompletedAt);
END
