import { describe, it, expect, vi, beforeEach } from 'vitest';

const findFirst = vi.fn();
const update = vi.fn();
const userFindUnique = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { userId: 9, role: 3 } }) }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    employeeTimeLog: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      update: (...a: unknown[]) => update(...a),
    },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));
vi.mock('@/lib/time', async () => ({
  ...(await vi.importActual<typeof import('@/lib/time')>('@/lib/time')),
  nowPstAsUtc: () => new Date(Date.UTC(1970, 0, 1, 9, 0)),
  getTodayRangePST: () => ({
    todayStart: new Date('2026-10-14T00:00:00.000Z'),
    todayEnd: new Date('2026-10-15T00:00:00.000Z'),
  }),
}));

const { POST } = await import('./route');

const t = (h: number, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m));
const skip = (breakType: string) =>
  POST(new Request('http://localhost/api/clock/skip', { method: 'POST', body: JSON.stringify({ breakType }) }));
const day = {
  timeLogId: 1, clockIn: t(6), firstBreakOut: null, firstBreakIn: null, lunchOut: null,
  lunchIn: null, secondBreakOut: null, secondBreakIn: null, clockOut: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  userFindUnique.mockResolvedValue({ status: false, isPartTime: false, breakOrder: null });
  update.mockImplementation(async (args: { data: object }) => ({ ...day, ...args.data }));
});

describe('POST /api/clock/skip', () => {
  it('skips lunch when lunch is next', async () => {
    findFirst.mockResolvedValue({ ...day, firstBreakOut: t(8), firstBreakIn: t(8, 10) });
    const res = await skip('lunch');
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][0].data).toEqual({ lunchOut: t(9), lunchIn: t(9) });
  });

  it('lets Janice skip lunch as her first step', async () => {
    userFindUnique.mockResolvedValue({ status: false, isPartTime: false, breakOrder: 'lunch,firstBreak,secondBreak' });
    findFirst.mockResolvedValue(day);
    expect((await skip('lunch')).status).toBe(200);
  });

  it('refuses to skip lunch before the steps that come first', async () => {
    findFirst.mockResolvedValue(day);
    expect((await skip('lunch')).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it.each(['firstBreak', 'secondBreak'])('does not let anyone skip %s, part-timers included', async (breakType) => {
    userFindUnique.mockResolvedValue({ status: false, isPartTime: true, breakOrder: null });
    findFirst.mockResolvedValue(day);
    expect((await skip(breakType)).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a deactivated account', async () => {
    userFindUnique.mockResolvedValue({ status: true, isPartTime: false, breakOrder: null });
    expect((await skip('lunch')).status).toBe(403);
  });
});
