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

/** An EmployeeDisconnectionAudit row as Prisma returns it. */
export interface DisconnectionAuditRow {
  idAudit: number;
  idUser: number;
  action: string;
  disconnectionDate: Date;
  oldStart: Date | null;
  oldEnd: Date | null;
  oldType: string | null;
  newStart: Date | null;
  newEnd: Date | null;
  newType: string | null;
  reason: string;
  modifiedBy: string;
  modifiedAt: Date;
}

/** A disconnection's span as the audit shows it (PST wall-clock TIME values). */
export interface DisconnectionSpan {
  start: Date;
  end: Date | null;
  type: string | null;
}

/** The audit shape the Time Management UI renders (hooks/use-admin-time `Audit`). */
export interface AuditDto {
  /** Time edits and disconnection changes have separate id sequences. */
  kind: 'time' | 'disconnection';
  id: number;
  userId: number;
  employeeName: string;
  date: string;
  /** A time field ('clockIn', …) or 'disconnection_add' | _edit | _remove. */
  field: string;
  oldValue: Date | null;
  newValue: Date | string;
  /** Disconnection changes only: the workday and the span before/after. */
  disconnection?: { day: string; before: DisconnectionSpan | null; after: DisconnectionSpan | null };
  modifiedBy: string;
  modifiedAt: string;
  reason: string;
}

const fullName = (u: { idUser: number; name: string | null; lastname: string | null }) =>
  `${u.name ?? ''} ${u.lastname ?? ''}`.trim() || `User #${u.idUser}`;

const isoDay = (d: Date) => new Date(d).toISOString().split('T')[0];

/** Names for raw idUser strings, in one query. */
async function lookupNames(ids: string[]): Promise<Map<string, string>> {
  const numeric = Array.from(new Set(ids.filter((v) => !!v && /^\d+$/.test(v)))).map(Number);
  const users = numeric.length
    ? await prisma.user.findMany({
        where: { idUser: { in: numeric } },
        select: { idUser: true, name: true, lastname: true },
      })
    : [];
  return new Map(users.map((u) => [String(u.idUser), fullName(u)]));
}

/** A pay period's disconnection changes (by the workday they affect). */
export function fetchDisconnectionAudits(
  periodStart: Date,
  periodEnd: Date,
  userId?: number,
): Promise<DisconnectionAuditRow[]> {
  return prisma.employeeDisconnectionAudit.findMany({
    where: {
      disconnectionDate: { gte: periodStart, lt: periodEnd },
      ...(userId ? { idUser: userId } : {}),
    },
    orderBy: { modifiedAt: 'desc' },
  });
}

/**
 * Turns time-edit and disconnection-change rows into what the UI shows,
 * newest first. IdUser and ModifiedBy are stored as raw idUser strings, so
 * both are resolved to names in a single lookup; a ModifiedBy that isn't a
 * number (legacy rows) is shown as written.
 */
export async function toAuditDtos(
  audits: AuditRow[],
  disconnectionAudits: DisconnectionAuditRow[] = [],
): Promise<AuditDto[]> {
  const names = await lookupNames([
    ...audits.flatMap((a) => [a.idUser, a.modifiedBy]),
    ...disconnectionAudits.flatMap((a) => [String(a.idUser), a.modifiedBy]),
  ]);
  const editor = (by: string) => (by ? (names.get(by) ?? by) : '');

  const timeDtos: AuditDto[] = audits.map((a) => ({
    kind: 'time',
    id: a.auditId,
    userId: Number(a.idUser),
    employeeName: names.get(a.idUser) ?? '',
    date: isoDay(a.modifiedDate),
    field: a.fieldModified ?? '',
    oldValue: a.oldValue,
    newValue: a.newValue ?? '',
    modifiedBy: editor(a.modifiedBy),
    modifiedAt: a.modifiedDate?.toISOString() ?? '',
    reason: a.reason ?? '',
  }));

  const disconnectionDtos: AuditDto[] = disconnectionAudits.map((a) => ({
    kind: 'disconnection',
    id: a.idAudit,
    userId: a.idUser,
    employeeName: names.get(String(a.idUser)) ?? '',
    date: isoDay(a.modifiedAt),
    field: `disconnection_${a.action}`,
    oldValue: null,
    newValue: '',
    disconnection: {
      day: isoDay(a.disconnectionDate),
      before: a.oldStart ? { start: a.oldStart, end: a.oldEnd, type: a.oldType } : null,
      after: a.newStart ? { start: a.newStart, end: a.newEnd, type: a.newType } : null,
    },
    modifiedBy: editor(a.modifiedBy),
    modifiedAt: a.modifiedAt.toISOString(),
    reason: a.reason,
  }));

  return [...timeDtos, ...disconnectionDtos].sort((x, y) => y.modifiedAt.localeCompare(x.modifiedAt));
}
