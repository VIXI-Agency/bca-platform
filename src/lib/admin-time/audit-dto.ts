import { prisma } from '@/lib/prisma';

/** An EmployeeTimeLogAudit row as Prisma returns it. */
export interface AuditRow {
  auditId: number;
  idUser: string;
  modifiedBy: string;
  modifiedDate: Date;
  fieldModified: string;
  oldValue: Date | null;
  newValue: Date | null;
  reason: string;
}

/** The audit shape the Time Management UI renders (hooks/use-admin-time `Audit`). */
export interface AuditDto {
  id: number;
  userId: number;
  employeeName: string;
  date: string;
  field: string;
  oldValue: Date | null;
  newValue: Date | string;
  modifiedBy: string;
  modifiedAt: string;
  reason: string;
}

const fullName = (u: { idUser: number; name: string | null; lastname: string | null }) =>
  `${u.name ?? ''} ${u.lastname ?? ''}`.trim() || `User #${u.idUser}`;

/**
 * Turns audit rows into what the UI shows. IdUser and ModifiedBy are stored
 * as raw idUser strings, so both are resolved to names in a single lookup;
 * a ModifiedBy that isn't a number (legacy rows) is shown as written.
 */
export async function toAuditDtos(audits: AuditRow[]): Promise<AuditDto[]> {
  const ids = Array.from(
    new Set(audits.flatMap((a) => [a.idUser, a.modifiedBy]).filter((v) => !!v && /^\d+$/.test(v))),
  ).map(Number);
  const users = ids.length
    ? await prisma.user.findMany({
        where: { idUser: { in: ids } },
        select: { idUser: true, name: true, lastname: true },
      })
    : [];
  const names = new Map(users.map((u) => [String(u.idUser), fullName(u)]));

  return audits.map((a) => ({
    id: a.auditId,
    userId: Number(a.idUser),
    employeeName: names.get(a.idUser) ?? '',
    date: new Date(a.modifiedDate).toISOString().split('T')[0],
    field: a.fieldModified ?? '',
    oldValue: a.oldValue,
    newValue: a.newValue ?? '',
    modifiedBy: a.modifiedBy ? (names.get(a.modifiedBy) ?? a.modifiedBy) : '',
    modifiedAt: a.modifiedDate?.toISOString() ?? '',
    reason: a.reason ?? '',
  }));
}
