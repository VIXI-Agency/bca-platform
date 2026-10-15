import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = { value: { user: { role: 1, userId: 1 } } as unknown };
const auditFindMany = vi.fn();
const usersFindMany = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: async () => session.value }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    employeeTimeLogAudit: { findMany: (...a: unknown[]) => auditFindMany(...a) },
    user: { findMany: (...a: unknown[]) => usersFindMany(...a) },
  },
}));

const { GET } = await import('./route');

const get = (query: string) => GET(new Request(`http://localhost/api/admin/time/audits${query}`));
const T = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

const row = (auditId: number, idUser: string, modifiedBy: string, iso: string, extra: Record<string, unknown> = {}) => ({
  auditId, timeLogId: 1, idUser, modifiedBy, modifiedDate: new Date(`${iso}T00:00:00.000Z`),
  fieldModified: 'clockIn', oldValue: T('06:02'), newValue: T('06:00'), reason: 'Forgot to clock in', ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  session.value = { user: { role: 1, userId: 1 } };
  auditFindMany.mockResolvedValue([
    row(2, '20', '1', '2026-10-13'),
    row(1, '10', '20', '2026-10-09', { newValue: null, reason: '0' }),
  ]);
  usersFindMany.mockResolvedValue([
    { idUser: 1, name: 'Carlos', lastname: 'Aragon' },
    { idUser: 10, name: 'Ana', lastname: 'Working' },
    { idUser: 20, name: 'Ben', lastname: null },
  ]);
});

describe('GET /api/admin/time/audits', () => {
  it('returns every employee’s edits in the pay period, newest first', async () => {
    const res = await get('?week=2026-10-09');
    expect(res.status).toBe(200);
    const body = await res.json();

    const where = auditFindMany.mock.calls[0][0].where;
    expect(where.idUser).toBeUndefined();
    expect(where.modifiedDate).toEqual({
      gte: new Date('2026-10-09T00:00:00.000Z'),
      lt: new Date('2026-10-16T00:00:00.000Z'),
    });
    expect(auditFindMany.mock.calls[0][0].orderBy).toEqual({ modifiedDate: 'desc' });

    expect(body.audits).toEqual([
      {
        id: 2, userId: 20, employeeName: 'Ben', date: '2026-10-13', field: 'clockIn',
        oldValue: '1970-01-01T06:02:00.000Z', newValue: '1970-01-01T06:00:00.000Z',
        modifiedBy: 'Carlos Aragon', modifiedAt: '2026-10-13T00:00:00.000Z', reason: 'Forgot to clock in',
      },
      {
        id: 1, userId: 10, employeeName: 'Ana Working', date: '2026-10-09', field: 'clockIn',
        oldValue: '1970-01-01T06:02:00.000Z', newValue: '',
        modifiedBy: 'Ben', modifiedAt: '2026-10-09T00:00:00.000Z', reason: '0',
      },
    ]);
  });

  it('looks up employee and editor names in one query', async () => {
    await get('?week=2026-10-09');
    expect(usersFindMany).toHaveBeenCalledTimes(1);
    expect(usersFindMany.mock.calls[0][0].where.idUser.in.sort()).toEqual([1, 10, 20]);
  });

  it('keeps a non-numeric editor as written', async () => {
    auditFindMany.mockResolvedValue([row(3, '10', 'legacy-admin', '2026-10-12')]);
    const body = await (await get('?week=2026-10-09')).json();
    expect(body.audits[0].modifiedBy).toBe('legacy-admin');
  });

  it('accepts any day of the period and snaps to its Friday', async () => {
    await get('?week=2026-10-14');
    expect(auditFindMany.mock.calls[0][0].where.modifiedDate.gte).toEqual(new Date('2026-10-09T00:00:00.000Z'));
  });

  it('caps the result size', async () => {
    await get('?week=2026-10-09');
    expect(auditFindMany.mock.calls[0][0].take).toBeGreaterThan(0);
  });

  it('rejects a malformed week', async () => {
    expect((await get('?week=oct-9')).status).toBe(400);
  });

  it('is for Administrators only', async () => {
    session.value = { user: { role: 2, userId: 5 } };
    expect((await get('?week=2026-10-09')).status).toBe(403);
    session.value = null;
    expect((await get('?week=2026-10-09')).status).toBe(401);
    expect(auditFindMany).not.toHaveBeenCalled();
  });
});
