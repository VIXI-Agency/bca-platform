-- Migration: deduplicate Businesses by PhoneDigits and enforce uniqueness
-- Run once against production DB. Already applied to benjaise_BCA on 2026-07-30.

-- Background
--
-- The scraper's old insert path compared the raw Phone string, so the same
-- number stored as "(202) 258-1937" and "(202) 2581937" produced two rows.
-- 10,824 such groups existed. They were merged, not deleted: calls were
-- repointed to the surviving row and its IdStatus was promoted to the most
-- advanced of the pair (7 > 4 > 2 > 1 > 3) so already-worked leads did not
-- return to the calling queue. 7,749 calls moved; none were lost.
--
-- The merge map is retained as dbo.DuplicateMergeMap_20260730 and is the
-- rollback record: it holds every deleted row's columns plus its survivor.

-- IX_Businesses_PhoneDigits already existed on the server but was never in
-- version control. Recorded here so a rebuilt environment matches production.
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.Businesses') AND name = 'IX_Businesses_PhoneDigits'
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_Businesses_PhoneDigits
  ON dbo.Businesses (PhoneDigits)
  INCLUDE (IdBusiness, BusinessName, Phone, IdStatus);
END

-- Backstop for the read-then-write duplicate check in src/lib/leads-db.ts,
-- which is safe single-threaded but not under concurrent ingest.
--
-- Not filtered: SQL Server rejects a computed column in a filter expression.
-- Unfiltered is viable because PhoneDigits has no NULLs and exactly one empty
-- value (IdBusiness 1967220, Phone '() -'). A second row whose phone reduces to
-- empty would now be rejected, which is the desired outcome anyway.
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.Businesses') AND name = 'UX_Businesses_PhoneDigits'
)
BEGIN
  CREATE UNIQUE NONCLUSTERED INDEX UX_Businesses_PhoneDigits
  ON dbo.Businesses (PhoneDigits);
END
