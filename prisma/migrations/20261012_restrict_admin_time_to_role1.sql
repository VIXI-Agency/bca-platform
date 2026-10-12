-- Migration: Time Management (hours, pay rates, Payment Report) becomes
-- Administrator-only. It was previously granted to role 2 (Closer) and
-- even role 3 (Remote Agent, though every route already blocked role 3
-- in code — this just cleans up the inconsistent permission data to match).
-- Matching code change restricts every /api/admin/time/** route and the
-- /admin/time page itself to role 1 only.

UPDATE benjaise_sqluser2.RolePermission
SET Enabled = 0
WHERE PermissionKey = 'admin_time' AND IdRole IN (2, 3);
