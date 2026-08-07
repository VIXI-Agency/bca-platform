-- Migration: give "On Call" an expiry so abandoned leads return to the pool
-- Run once against production DB before deploying the matching app version.

-- Background
--
-- CallStatus 1 is "On Call": the transient state a lead enters the moment
-- /api/calls/next-lead hands it to an agent. Nothing ever moved it back. A lead
-- only left that state if the agent logged a call (-> 2) or reverted it (-> 3),
-- so every closed tab, dropped connection and skipped lead parked a row there
-- permanently.
--
-- On 2026-08-07 that had accumulated to 687,514 rows, of which 301,133 had no
-- call record at all -- handed out, never contacted, invisible to everyone.
-- Their IdBusiness ran from 1 to 3,513,630, so the leak predates this app and
-- goes back to the legacy ASP.NET system. Those 301,133 were released to status
-- 3 in the same session; the list is retained as dbo.StuckLeadReset_20260807
-- and is the rollback record.
--
-- This migration closes the hole the cleanup drained. OnCallSince timestamps
-- the handout, and next-lead releases anything older than the expiry on its way
-- past, so the pool self-heals without a scheduler.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Businesses') AND name = 'OnCallSince'
)
BEGIN
  ALTER TABLE dbo.Businesses ADD OnCallSince DATETIME2 NULL;
END

-- Deliberately left NULL for the 386,383 rows already sitting at status 1 with
-- a call on record. Those were contacted at least once, so releasing them means
-- calling somebody a second time -- a business decision, not a data repair. The
-- reclaim below requires OnCallSince IS NOT NULL precisely so it can never pick
-- them up on its own.

-- EXEC, not a bare CREATE INDEX: SQL Server compiles the whole batch up front
-- and would not yet see a column added earlier in it.
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.Businesses') AND name = 'IX_Businesses_OnCallSince'
)
BEGIN
  -- Filtered to status 1, which is the only status the reclaim scans and, once
  -- the backlog is worked off, holds only the handful of leads open right now.
  EXEC('
    CREATE NONCLUSTERED INDEX IX_Businesses_OnCallSince
    ON dbo.Businesses (OnCallSince)
    WHERE IdStatus = 1;
  ');
END
