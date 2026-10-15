-- Migration: let admins add, edit and remove disconnections after the fact,
-- with a history of every change.
-- Run once against production DB before deploying the matching app version.
-- Additive only: two nullable columns and one new table; no existing row changes.

-- Removing a disconnection is a soft delete. IsActive can't be reused for it:
-- the legacy app set IsActive = 0 when an employee was reconnected.
IF COL_LENGTH('benjaise_sqluser2.EmployeeDisconnections', 'RemovedAt') IS NULL
  ALTER TABLE benjaise_sqluser2.EmployeeDisconnections ADD RemovedAt DATETIME NULL;

IF COL_LENGTH('benjaise_sqluser2.EmployeeDisconnections', 'RemovedBy') IS NULL
  ALTER TABLE benjaise_sqluser2.EmployeeDisconnections ADD RemovedBy NVARCHAR(100) NULL;

IF OBJECT_ID('benjaise_sqluser2.EmployeeDisconnectionAudits') IS NULL
BEGIN
  CREATE TABLE benjaise_sqluser2.EmployeeDisconnectionAudits (
    IdAudit          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_EmployeeDisconnectionAudits PRIMARY KEY,
    IdDisconnection  INT NOT NULL,
    IdUser           INT NOT NULL,
    Action           NVARCHAR(10) NOT NULL,   -- 'add' | 'edit' | 'remove'
    DisconnectionDate DATE NOT NULL,          -- the workday the disconnection belongs to
    OldStart         TIME NULL,
    OldEnd           TIME NULL,
    OldType          NVARCHAR(50) NULL,
    NewStart         TIME NULL,
    NewEnd           TIME NULL,
    NewType          NVARCHAR(50) NULL,
    Reason           NVARCHAR(500) NOT NULL,
    ModifiedBy       NVARCHAR(100) NOT NULL,
    ModifiedAt       DATETIME NOT NULL CONSTRAINT DF_EmployeeDisconnectionAudits_ModifiedAt DEFAULT GETDATE(),
    CONSTRAINT FK_EmployeeDisconnectionAudits_Disconnection FOREIGN KEY (IdDisconnection)
      REFERENCES benjaise_sqluser2.EmployeeDisconnections (IdDisconnection),
    CONSTRAINT FK_EmployeeDisconnectionAudits_User FOREIGN KEY (IdUser) REFERENCES dbo.Users (IdUser),
    CONSTRAINT CK_EmployeeDisconnectionAudits_Action CHECK (Action IN ('add', 'edit', 'remove'))
  );

  -- The Audit Log and Payment Report read a pay period's changes by date.
  CREATE INDEX IX_EmployeeDisconnectionAudits_Date ON benjaise_sqluser2.EmployeeDisconnectionAudits (DisconnectionDate, IdUser);
END
