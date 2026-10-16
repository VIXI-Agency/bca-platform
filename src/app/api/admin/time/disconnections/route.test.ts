import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = { value: { user: { role: 1, userId: 262 } } as unknown };
const locked = { value: false };
const today = new Date('2026-10-15T00:00:00.000Z');

const tx = {
  employeeDisconnection: { create: vi.fn(), update: vi.fn() },
  employeeDisconnectionAudit: { create: vi.fn() },
};
const userFindUnique = vi.fn();
const disconnectionFindUnique = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: async () => session.value }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    employeeDisconnection: { findUnique: (...a: unknown[]) => disconnectionFindUnique(...a) },
  },
}));
vi.mock('@/lib/payroll/compute', () => ({ isPeriodLocked: async () => locked.value, isDayLocked: async () => locked.value }));
vi.mock('@/lib/time', async () => ({
  ...(await vi.importActual<typeof import('@/lib/time')>('@/lib/time')),
  getTodayRangePST: () => ({ todayStart: today, todayEnd: new Date(today.getTime() + 86_400_000) }),
}));

const { POST } = await import('./route');
const { PATCH, DELETE } = await import('./[id]/route');

const T = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);
const json = (method: string, body: unknown) =>
  new Request('http://localhost/api/admin/time/disconnections', { method, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const validAdd = {
  userId: 40, date: '2026-10-14', start: '09:00', end: '09:45', type: 'internet_outage',
  reason: 'Forgot to disconnect him yesterday',
};

const existing = {
  idDisconnection: 14, idUser: 40, disconnectionDate: new Date('2026-10-13T00:00:00.000Z'),
  disconnectionTime: T('08:54'), reconnectionTime: T('09:10'), disconnectionType: 'other',
  reason: null, removedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  session.value = { user: { role: 1, userId: 262 } };
  locked.value = false;
  userFindUnique.mockResolvedValue({ idUser: 40 });
  disconnectionFindUnique.mockResolvedValue(existing);
  tx.employeeDisconnection.create.mockResolvedValue({ ...existing, idDisconnection: 99 });
  tx.employeeDisconnection.update.mockImplementation(async ({ data }: { data: object }) => ({ ...existing, ...data }));
});

describe('POST /api/admin/time/disconnections (add after the fact)', () => {
  it('records a past disconnection and its history entry', async () => {
    const res = await POST(json('POST', validAdd));
    expect(res.status).toBe(201);

    const data = tx.employeeDisconnection.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      idUser: 40,
      disconnectionDate: new Date('2026-10-14T00:00:00.000Z'),
      disconnectionTime: T('09:00'),
      reconnectionTime: T('09:45'),
      disconnectionType: 'internet_outage',
      reason: 'Forgot to disconnect him yesterday',
      disconnectedBy: '262',
    });

    expect(tx.employeeDisconnectionAudit.create.mock.calls[0][0].data).toMatchObject({
      idDisconnection: 99, idUser: 40, action: 'add',
      disconnectionDate: new Date('2026-10-14T00:00:00.000Z'),
      oldStart: null, oldEnd: null, oldType: null,
      newStart: T('09:00'), newEnd: T('09:45'), newType: 'internet_outage',
      reason: 'Forgot to disconnect him yesterday', modifiedBy: '262',
    });
  });

  it('accepts no reconnection time (it then runs until clock-out)', async () => {
    const res = await POST(json('POST', { ...validAdd, end: null }));
    expect(res.status).toBe(201);
    expect(tx.employeeDisconnection.create.mock.calls[0][0].data.reconnectionTime).toBeNull();
  });

  it('allows today', async () => {
    expect((await POST(json('POST', { ...validAdd, date: '2026-10-15' }))).status).toBe(201);
  });

  it.each([
    ['a reconnection before the disconnection', { end: '08:30' }],
    ['a reconnection equal to the disconnection', { end: '09:00' }],
    ['a reason shorter than 8 characters', { reason: '0' }],
    ['an unknown type', { type: 'lunch' }],
    ['a malformed date', { date: '10/14/2026' }],
    ['a malformed time', { start: '9:00' }],
  ])('rejects %s', async (_name, change) => {
    expect((await POST(json('POST', { ...validAdd, ...change }))).status).toBe(400);
    expect(tx.employeeDisconnection.create).not.toHaveBeenCalled();
  });

  it('rejects a future day', async () => {
    expect((await POST(json('POST', { ...validAdd, date: '2026-10-16' }))).status).toBe(400);
  });

  it('refuses a period that is approved or paid', async () => {
    locked.value = true;
    expect((await POST(json('POST', validAdd))).status).toBe(409);
    expect(tx.employeeDisconnection.create).not.toHaveBeenCalled();
  });

  it('404s for an unknown employee', async () => {
    userFindUnique.mockResolvedValue(null);
    expect((await POST(json('POST', validAdd))).status).toBe(404);
  });

  it('is for Administrators only', async () => {
    session.value = { user: { role: 2, userId: 5 } };
    expect((await POST(json('POST', validAdd))).status).toBe(403);
    session.value = null;
    expect((await POST(json('POST', validAdd))).status).toBe(401);
  });
});

describe('PATCH /api/admin/time/disconnections/[id] (fix a wrong one)', () => {
  const edit = { start: '08:50', end: '09:05', type: 'power_outage', reason: 'Wrong times were entered' };

  it('updates the times and type and records before and after', async () => {
    const res = await PATCH(json('PATCH', edit), params('14'));
    expect(res.status).toBe(200);

    expect(tx.employeeDisconnection.update.mock.calls[0][0]).toMatchObject({
      where: { idDisconnection: 14 },
      data: { disconnectionTime: T('08:50'), reconnectionTime: T('09:05'), disconnectionType: 'power_outage' },
    });
    expect(tx.employeeDisconnectionAudit.create.mock.calls[0][0].data).toMatchObject({
      idDisconnection: 14, idUser: 40, action: 'edit',
      oldStart: T('08:54'), oldEnd: T('09:10'), oldType: 'other',
      newStart: T('08:50'), newEnd: T('09:05'), newType: 'power_outage',
      reason: 'Wrong times were entered', modifiedBy: '262',
    });
  });

  it('can clear the reconnection time', async () => {
    await PATCH(json('PATCH', { ...edit, end: null }), params('14'));
    expect(tx.employeeDisconnection.update.mock.calls[0][0].data.reconnectionTime).toBeNull();
  });

  it('checks the lock for the disconnection’s own day', async () => {
    locked.value = true;
    expect((await PATCH(json('PATCH', edit), params('14'))).status).toBe(409);
  });

  it('404s for a missing or removed disconnection', async () => {
    disconnectionFindUnique.mockResolvedValue(null);
    expect((await PATCH(json('PATCH', edit), params('14'))).status).toBe(404);
    disconnectionFindUnique.mockResolvedValue({ ...existing, removedAt: new Date() });
    expect((await PATCH(json('PATCH', edit), params('14'))).status).toBe(404);
  });

  it('rejects a reconnection before the disconnection and a bad id', async () => {
    expect((await PATCH(json('PATCH', { ...edit, end: '08:00' }), params('14'))).status).toBe(400);
    expect((await PATCH(json('PATCH', edit), params('abc'))).status).toBe(400);
  });

  it('is for Administrators only', async () => {
    session.value = { user: { role: 2, userId: 5 } };
    expect((await PATCH(json('PATCH', edit), params('14'))).status).toBe(403);
  });
});

describe('DELETE /api/admin/time/disconnections/[id] (remove one entered by mistake)', () => {
  const remove = { reason: 'Disconnected the wrong employee' };

  it('soft-deletes it and records what it was', async () => {
    const res = await DELETE(json('DELETE', remove), params('14'));
    expect(res.status).toBe(200);

    const update = tx.employeeDisconnection.update.mock.calls[0][0];
    expect(update.where).toEqual({ idDisconnection: 14 });
    expect(update.data.removedAt).toBeInstanceOf(Date);
    expect(update.data.removedBy).toBe('262');

    expect(tx.employeeDisconnectionAudit.create.mock.calls[0][0].data).toMatchObject({
      idDisconnection: 14, action: 'remove',
      oldStart: T('08:54'), oldEnd: T('09:10'), oldType: 'other',
      newStart: null, newEnd: null, newType: null,
      reason: 'Disconnected the wrong employee',
    });
  });

  it('requires a real reason', async () => {
    expect((await DELETE(json('DELETE', { reason: 'oops' }), params('14'))).status).toBe(400);
  });

  it('refuses a locked period and an already removed one', async () => {
    locked.value = true;
    expect((await DELETE(json('DELETE', remove), params('14'))).status).toBe(409);
    locked.value = false;
    disconnectionFindUnique.mockResolvedValue({ ...existing, removedAt: new Date() });
    expect((await DELETE(json('DELETE', remove), params('14'))).status).toBe(404);
  });
});
