-- Migration: which breaks each employee takes, and in what order, as a
-- comma list of firstBreak / lunch / secondBreak (e.g. 'lunch,firstBreak,secondBreak').
-- NULL = the default: full time Break, Lunch, Break; part time one break, no lunch.
-- '' = no breaks at all.
-- Run once against production DB before deploying the matching app version.
-- Additive only: one nullable column; no existing row changes.

IF COL_LENGTH('dbo.Users', 'BreakOrder') IS NULL
  ALTER TABLE dbo.Users ADD BreakOrder NVARCHAR(40) NULL;
