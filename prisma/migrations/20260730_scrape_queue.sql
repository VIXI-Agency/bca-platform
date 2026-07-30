-- Migration: queue tables for automated lead scraping
-- Run once against production DB before deploying the matching app version.
-- Additive only: creates five new tables, touches nothing existing.

-- Timestamps carry no DEFAULT on purpose. GETDATE() is server-local while
-- Prisma writes DateTime as UTC, and the 30-minute lease expiry compares the
-- two. A 5-6 hour skew would make every leased task look expired and hand the
-- same rows out repeatedly. The application supplies every value, in UTC.

IF OBJECT_ID('dbo.ScrapeIndustries') IS NULL
BEGIN
  CREATE TABLE dbo.ScrapeIndustries (
    Id     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ScrapeIndustries PRIMARY KEY,
    Name   NVARCHAR(100) NOT NULL,
    Active BIT NOT NULL CONSTRAINT DF_ScrapeIndustries_Active DEFAULT 1
  );
  CREATE UNIQUE INDEX UX_ScrapeIndustries_Name ON dbo.ScrapeIndustries (Name);
END

IF OBJECT_ID('dbo.ScrapeCities') IS NULL
BEGIN
  CREATE TABLE dbo.ScrapeCities (
    Id       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ScrapeCities PRIMARY KEY,
    City     NVARCHAR(100) NOT NULL,
    State    NCHAR(2) NOT NULL,
    TimeZone NVARCHAR(3) NOT NULL
  );
  CREATE UNIQUE INDEX UX_ScrapeCities_City_State ON dbo.ScrapeCities (City, State);
  CREATE INDEX IX_ScrapeCities_State ON dbo.ScrapeCities (State);
END

IF OBJECT_ID('dbo.ScrapeRuns') IS NULL
BEGIN
  CREATE TABLE dbo.ScrapeRuns (
    Id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ScrapeRuns PRIMARY KEY,
    StartedAt     DATETIME2 NOT NULL,
    FinishedAt    DATETIME2 NULL,
    TasksDone     INT NOT NULL CONSTRAINT DF_ScrapeRuns_TasksDone DEFAULT 0,
    LeadsFound    INT NOT NULL CONSTRAINT DF_ScrapeRuns_LeadsFound DEFAULT 0,
    LeadsImported INT NOT NULL CONSTRAINT DF_ScrapeRuns_LeadsImported DEFAULT 0,
    Duplicates    INT NOT NULL CONSTRAINT DF_ScrapeRuns_Duplicates DEFAULT 0,
    Blacklisted   INT NOT NULL CONSTRAINT DF_ScrapeRuns_Blacklisted DEFAULT 0,
    Status        NVARCHAR(20) NOT NULL,
    FinishReason  NVARCHAR(20) NULL
  );
  CREATE INDEX IX_ScrapeRuns_StartedAt ON dbo.ScrapeRuns (StartedAt DESC);
END

IF OBJECT_ID('dbo.ScrapeRequests') IS NULL
BEGIN
  CREATE TABLE dbo.ScrapeRequests (
    Id        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ScrapeRequests PRIMARY KEY,
    CreatedBy NVARCHAR(200) NOT NULL,
    CreatedAt DATETIME2 NOT NULL,
    Status    NVARCHAR(20) NOT NULL,
    MaxPages  INT NOT NULL CONSTRAINT DF_ScrapeRequests_MaxPages DEFAULT 3
  );
  CREATE INDEX IX_ScrapeRequests_Status_CreatedAt ON dbo.ScrapeRequests (Status, CreatedAt);
END

IF OBJECT_ID('dbo.ScrapeTasks') IS NULL
BEGIN
  CREATE TABLE dbo.ScrapeTasks (
    Id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ScrapeTasks PRIMARY KEY,
    IdRequest     INT NOT NULL,
    IdRun         INT NULL,
    Industry      NVARCHAR(100) NOT NULL,
    City          NVARCHAR(100) NOT NULL,
    State         NCHAR(2) NOT NULL,
    TimeZone      NVARCHAR(3) NOT NULL,
    Status        NVARCHAR(20) NOT NULL,
    Attempts      INT NOT NULL CONSTRAINT DF_ScrapeTasks_Attempts DEFAULT 0,
    LeasedAt      DATETIME2 NULL,
    CompletedAt   DATETIME2 NULL,
    FoundCount    INT NULL,
    ImportedCount INT NULL,
    LastError     NVARCHAR(500) NULL,
    CONSTRAINT FK_ScrapeTasks_Request FOREIGN KEY (IdRequest)
      REFERENCES dbo.ScrapeRequests (Id),
    CONSTRAINT FK_ScrapeTasks_Run FOREIGN KEY (IdRun)
      REFERENCES dbo.ScrapeRuns (Id)
  );

  -- Coverage is global, not per request: one task per industry-city-state pair,
  -- ever. A second overlapping request reuses the existing rows instead of
  -- re-queueing territory already covered. Cancelling a request deletes only
  -- its pending tasks, so completed coverage survives.
  CREATE UNIQUE INDEX UX_ScrapeTasks_Coverage
    ON dbo.ScrapeTasks (Industry, City, State);

  -- Serves the lease: WHERE Status = 'pending' ORDER BY Id. Id comes free as
  -- the clustered key, so no explicit second column is needed.
  CREATE INDEX IX_ScrapeTasks_Status_Request ON dbo.ScrapeTasks (Status, IdRequest);
  CREATE INDEX IX_ScrapeTasks_Request ON dbo.ScrapeTasks (IdRequest);
END

-- Rows rejected for a missing name, a missing phone, or fewer than ten digits
-- are neither duplicates nor blacklisted. Folding them into Duplicates made the
-- daily email overstate how much of a run was wasted on repeats.
IF COL_LENGTH('dbo.ScrapeRuns', 'Invalid') IS NULL
BEGIN
  ALTER TABLE dbo.ScrapeRuns
    ADD [Invalid] INT NOT NULL CONSTRAINT DF_ScrapeRuns_Invalid DEFAULT 0;
END
