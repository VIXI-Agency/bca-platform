-- Migration: Phase 1 payroll module — payment history & paid status.
-- Additive only: four new tables in benjaise_sqluser2, plus a role-permission
-- seed row so the owner (role 1) isn't locked out of the new /admin/payroll
-- page the moment this deploys. Nothing existing is touched.

IF OBJECT_ID('benjaise_sqluser2.PayRuns') IS NULL
BEGIN
  CREATE TABLE benjaise_sqluser2.PayRuns (
    IdPayRun         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PayRuns PRIMARY KEY,
    PeriodStart      DATE NOT NULL,
    PeriodEnd        DATE NOT NULL,
    Status           NVARCHAR(20) NOT NULL,
    ScheduledPayDate DATE NULL,
    ApprovedBy       NVARCHAR(100) NULL,
    ApprovedAt       DATETIME NULL,
    PaidAt           DATETIME NULL,
    VoidedBy         NVARCHAR(100) NULL,
    VoidedAt         DATETIME NULL,
    VoidReason       NVARCHAR(500) NULL,
    Notes            NVARCHAR(1000) NULL,
    CreatedAt        DATETIME NOT NULL CONSTRAINT DF_PayRuns_CreatedAt DEFAULT GETDATE()
  );
  CREATE UNIQUE INDEX UQ_PayRun_Period ON benjaise_sqluser2.PayRuns (PeriodStart);
END

IF OBJECT_ID('benjaise_sqluser2.PayStatements') IS NULL
BEGIN
  CREATE TABLE benjaise_sqluser2.PayStatements (
    IdStatement      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PayStatements PRIMARY KEY,
    IdPayRun         INT NOT NULL,
    IdUser           INT NOT NULL,
    EmployeeName     NVARCHAR(200) NOT NULL,
    RegularHours     DECIMAL(6,2) NOT NULL,
    OvertimeHours    DECIMAL(6,2) NOT NULL,
    PayRate          DECIMAL(10,2) NULL,
    OtPayRate        DECIMAL(10,2) NULL,
    RegularPay       DECIMAL(10,2) NOT NULL,
    OvertimePay      DECIMAL(10,2) NOT NULL,
    BonusTotal       DECIMAL(10,2) NOT NULL,
    GrossPay         DECIMAL(10,2) NOT NULL,
    Status           NVARCHAR(20) NOT NULL,
    PaymentMethod    NVARCHAR(30) NULL,
    PaymentReference NVARCHAR(200) NULL,
    PaidDate         DATE NULL,
    SnapshotJson     NVARCHAR(MAX) NULL,
    CreatedAt        DATETIME NOT NULL CONSTRAINT DF_PayStatements_CreatedAt DEFAULT GETDATE(),
    CONSTRAINT FK_PayStatements_Run FOREIGN KEY (IdPayRun) REFERENCES benjaise_sqluser2.PayRuns (IdPayRun),
    CONSTRAINT FK_PayStatements_User FOREIGN KEY (IdUser) REFERENCES dbo.Users (IdUser)
  );
  CREATE UNIQUE INDEX UQ_PayStatement_Run_User ON benjaise_sqluser2.PayStatements (IdPayRun, IdUser);
  CREATE INDEX IX_PayStatements_User ON benjaise_sqluser2.PayStatements (IdUser);
END

IF OBJECT_ID('benjaise_sqluser2.PayStatementLines') IS NULL
BEGIN
  CREATE TABLE benjaise_sqluser2.PayStatementLines (
    IdLine      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PayStatementLines PRIMARY KEY,
    IdStatement INT NOT NULL,
    Kind        NVARCHAR(20) NOT NULL,
    Category    NVARCHAR(50) NULL,
    Label       NVARCHAR(100) NOT NULL,
    Quantity    DECIMAL(10,2) NULL,
    Rate        DECIMAL(10,2) NULL,
    Amount      DECIMAL(10,2) NOT NULL,
    CONSTRAINT FK_PayStatementLines_Statement FOREIGN KEY (IdStatement) REFERENCES benjaise_sqluser2.PayStatements (IdStatement)
  );
  CREATE INDEX IX_PayStatementLines_Statement ON benjaise_sqluser2.PayStatementLines (IdStatement);
END

IF OBJECT_ID('benjaise_sqluser2.PayRateHistory') IS NULL
BEGIN
  CREATE TABLE benjaise_sqluser2.PayRateHistory (
    IdHistory     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PayRateHistory PRIMARY KEY,
    IdUser        INT NOT NULL,
    PayRate       DECIMAL(10,2) NULL,
    OtPayRate     DECIMAL(10,2) NULL,
    EffectiveFrom DATETIME NOT NULL CONSTRAINT DF_PayRateHistory_EffectiveFrom DEFAULT GETDATE(),
    ChangedBy     NVARCHAR(100) NULL,
    CONSTRAINT FK_PayRateHistory_User FOREIGN KEY (IdUser) REFERENCES dbo.Users (IdUser)
  );
  CREATE INDEX IX_PayRateHistory_User ON benjaise_sqluser2.PayRateHistory (IdUser, EffectiveFrom DESC);
END

-- Grant the new 'admin_payroll' permission to role 1 (Administrator) only —
-- deliberately not to role 2/3, matching "owner's role only by default".
-- The owner can extend it to a manager later from the Permissions page.
IF NOT EXISTS (SELECT 1 FROM benjaise_sqluser2.RolePermission WHERE IdRole = 1 AND PermissionKey = 'admin_payroll')
  INSERT INTO benjaise_sqluser2.RolePermission (IdRole, PermissionKey, Enabled) VALUES (1, 'admin_payroll', 1);
