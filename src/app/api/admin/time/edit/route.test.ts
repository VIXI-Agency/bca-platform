import { describe, it, expect, vi, beforeEach } from 'vitest';

const findFirst = vi.fn();
const userFindUnique = vi.fn();
const update = vi.fn();
const auditCreate = vi.fn();
const transaction = vi.fn(async (ops: unknown[]) => ops);

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { role: 1, userId: 262 } }) }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (ops: unknown[]) => transaction(ops),
    employeeTimeLog: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      update: (...a: unknown[]) => update(...a),
    },
    employeeTimeLogAudit: { create: (...a: unknown[]) => auditCreate(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));
vi.mock('@/lib/payroll/compute', () => ({ isPeriodLocked: async () => false, isDayLocked: async () => false }));

const { POST } = await import('./route');

const t = (h: number, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m));
const edit = (field: string, value: string) =>
  POST(new Request('http://localhost/api/admin/time/edit', {
    method: 'POST',
    body: JSON.stringify({ userId: 247, date: '2026-10-14', field, value, reason: 'Forgot to punch the break' }),
  }));
/** Lunch at 9:00 and a first break after it, as Janice takes them. */
const lunchFirstDay = {
  timeLogId: 1, logDate: new Date('2026-10-14T00:00:00.000Z'), clockIn: t(6),
  lunchOut: t(9), lunchIn: t(9, 30), firstBreakOut: null, firstBreakIn: null,
  secondBreakOut: null, secondBreakIn: null, clockOut: t(14, 30),
};

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue(lunchFirstDay);
  update.mockReturnValue({ timeLogId: 1 });
});

describe('POST /api/admin/time/edit — punch order', () => {
  it('accepts a first break after lunch for someone who takes lunch first', async () => {
    userFindUnique.mockResolvedValue({ isPartTime: false, breakOrder: 'lunch,firstBreak,secondBreak' });
    const res = await edit('firstBreakOut', '11:00');
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('keeps rejecting it for the standard order', async () => {
    userFindUnique.mockResolvedValue({ isPartTime: false, breakOrder: null });
    findFirst.mockResolvedValue({ ...lunchFirstDay, firstBreakIn: t(11, 10) });
    const res = await edit('firstBreakOut', '11:00');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('firstBreakIn cannot be after lunchOut');
    expect(update).not.toHaveBeenCalled();
  });
});
