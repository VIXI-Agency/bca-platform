-- Migration: correct the two disconnections the Next.js app stored in UTC.
--
-- /api/admin/time/disconnect wrote DisconnectionTime/ReconnectionTime with a
-- plain new Date() (UTC) while every clock punch is stored as Pacific
-- wall-clock time. Both rows fall in daylight time (PDT = UTC-7), so each is
-- shifted back 7 hours. Older rows came from the legacy app and are already
-- Pacific. The WHERE clauses pin the original UTC hour (the stored values
-- carry fractional seconds), so re-running this is a no-op.
--
--   13  Aixa Bouzebal  2026-04-28  20:12-20:41 UTC -> 13:12-13:41
--   14  Richard Grant  2026-10-13  15:54-16:10 UTC -> 08:54-09:10

UPDATE benjaise_sqluser2.EmployeeDisconnections
SET DisconnectionTime = DATEADD(HOUR, -7, DisconnectionTime),
    ReconnectionTime  = DATEADD(HOUR, -7, ReconnectionTime)
WHERE IdDisconnection = 13
  AND DATEPART(HOUR, DisconnectionTime) = 20
  AND DATEPART(HOUR, ReconnectionTime)  = 20;

UPDATE benjaise_sqluser2.EmployeeDisconnections
SET DisconnectionTime = DATEADD(HOUR, -7, DisconnectionTime),
    ReconnectionTime  = DATEADD(HOUR, -7, ReconnectionTime)
WHERE IdDisconnection = 14
  AND DATEPART(HOUR, DisconnectionTime) = 15
  AND DATEPART(HOUR, ReconnectionTime)  = 16;
