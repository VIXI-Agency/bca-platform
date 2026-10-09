-- Migration: Pay rate fields on Users + disconnection category, for the payroll report
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Users') AND name='PayRate')
  ALTER TABLE dbo.Users ADD PayRate DECIMAL(10,2) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.Users') AND name='OtPayRate')
  ALTER TABLE dbo.Users ADD OtPayRate DECIMAL(10,2) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('benjaise_sqluser2.EmployeeDisconnections') AND name='DisconnectionType')
  ALTER TABLE benjaise_sqluser2.EmployeeDisconnections ADD DisconnectionType NVARCHAR(30) NULL;
