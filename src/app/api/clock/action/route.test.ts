import { describe, it, expect, vi, beforeEach } from 'vitest';

// applyEarlyClockInRule is private to the route, so it is exercised through
// POST: the session supplies the role, nowPstAsUtc supplies the punch time,
// and the clock-in value written to the database is what gets asserted.

const auth = vi.fn();
const findFirst = vi.fn();
const create = vi.fn();
const update = vi.fn();
const userFindUnique = vi.fn();
const nowPstAsUtc = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    employeeTimeLog: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      create: (...a: unknown[]) => create(...a),
      update: (...a: unknown[]) => update(...a),
    },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));
vi.mock('@/lib/time', async () => ({
  ...(await vi.importActual<typeof import('@/lib/time')>('@/lib/time')),
  nowPstAsUtc: () => nowPstAsUtc(),
  getTodayRangePST: () => ({
    todayStart: new Date('2026-10-14T00:00:00.000Z'),
    todayEnd: new Date('2026-10-15T00:00:00.000Z'),
  }),
}));

const { POST } = await import('./route');

const ADMIN = 1;
const CLOSER = 2;
const REMOTE_AGENT = 3;

const t = (hhmmss: string) => {
  const [h, m, s = 0] = hhmmss.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, h, m, s));
};
const hhmmss = (d: Date) => d.toISOString().slice(11, 19);

const post = (action: string) =>
  POST(new Request('http://localhost/api/clock/action', { method: 'POST', body: JSON.stringify({ action }) }));

/** Clock in at `punch` with `role`; returns the clock-in time that was stored. */
const clockIn = async (punch: string, role: number | undefined) => {
  auth.mockResolvedValue({ user: { userId: 9, role } });
  nowPstAsUtc.mockReturnValue(t(punch));
  const res = await post('clockIn');
  expect(res.status).toBe(200);
  expect(create).toHaveBeenCalledTimes(1);
  return hhmmss(create.mock.calls[0][0].data.clockIn);
};

beforeEach(() => {
  vi.clearAllMocks();
  userFindUnique.mockResolvedValue({ status: false });
  findFirst.mockResolvedValue(null);
  create.mockImplementation(async (args: { data: object }) => ({ timeLogId: 1, ...args.data }));
  update.mockImplementation(async (args: { data: object }) => ({ timeLogId: 1, ...args.data }));
});

describe('POST /api/clock/action — early clock-in rule', () => {
  describe.each([
    ['Administrator', ADMIN],
    ['Closer', CLOSER],
  ])('%s', (_name, role) => {
    it.each([
      ['05:45:00', '05:45:00'], // first minute of the window
      ['05:47:12', '05:47:12'],
      ['05:59:59', '05:59:59'],
    ])('keeps the real time for a %s punch inside the 15-minute window', async (punch, stored) => {
      expect(await clockIn(punch, role)).toBe(stored);
    });

    it.each([
      ['05:44:59', '05:45:00'],
      ['05:00:00', '05:45:00'],
      ['00:30:00', '05:45:00'],
    ])('clamps a %s punch to 05:45', async (punch, stored) => {
      expect(await clockIn(punch, role)).toBe(stored);
    });

    it('keeps a punch at or after 06:00 unchanged', async () => {
      expect(await clockIn('06:00:30', role)).toBe('06:00:30');
    });
  });

  describe('every other role', () => {
    it.each([
      ['05:59:59'],
      ['05:50:00'],
      ['05:45:00'],
      ['04:00:00'],
    ])('snaps a %s punch to 06:00', async (punch) => {
      expect(await clockIn(punch, REMOTE_AGENT)).toBe('06:00:00');
    });

    it('snaps an early punch to 06:00 when the session carries no role', async () => {
      expect(await clockIn('05:50:00', undefined)).toBe('06:00:00');
    });

    it.each([
      ['06:00:00'],
      ['06:00:30'],
      ['07:12:05'],
    ])('keeps a %s punch unchanged', async (punch) => {
      expect(await clockIn(punch, REMOTE_AGENT)).toBe(punch);
    });
  });

  it('writes the adjusted time onto an existing log created by a skip', async () => {
    findFirst.mockResolvedValue({ timeLogId: 5, clockIn: null, clockOut: null });
    auth.mockResolvedValue({ user: { userId: 9, role: REMOTE_AGENT } });
    nowPstAsUtc.mockReturnValue(t('05:30:00'));
    const res = await post('clockIn');
    expect(res.status).toBe(200);
    expect(create).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0]).toEqual({ where: { timeLogId: 5 }, data: { clockIn: t('06:00:00') } });
  });

  it('does not adjust actions other than clock-in', async () => {
    findFirst.mockResolvedValue({ timeLogId: 5, clockIn: t('05:45:00'), clockOut: null, firstBreakOut: null });
    auth.mockResolvedValue({ user: { userId: 9, role: REMOTE_AGENT } });
    nowPstAsUtc.mockReturnValue(t('05:55:00'));
    const res = await post('firstBreakOut');
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][0].data).toEqual({ firstBreakOut: t('05:55:00') });
  });

  it('rejects an unauthenticated request without writing anything', async () => {
    auth.mockResolvedValue(null);
    const res = await post('clockIn');
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('POST /api/clock/action — guards on paid time', () => {
  const fullDay = {
    timeLogId: 5,
    clockIn: t('06:00:00'),
    firstBreakOut: t('06:00:01'),
    firstBreakIn: t('06:00:02'),
    lunchOut: t('06:00:03'),
    lunchIn: t('06:00:04'),
    secondBreakOut: t('06:00:05'),
    secondBreakIn: t('06:00:06'),
    clockOut: null,
  };

  it('refuses a clock-out before the recorded (snapped) clock-in', async () => {
    // Clocked in at 05:00 (stored as 06:00), then clock out at 05:01 — this
    // used to be read as a ~23h overnight shift.
    findFirst.mockResolvedValue(fullDay);
    auth.mockResolvedValue({ user: { userId: 9, role: REMOTE_AGENT } });
    nowPstAsUtc.mockReturnValue(t('05:01:00'));
    const res = await post('clockOut');
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a clock-out in the same instant as the clock-in', async () => {
    findFirst.mockResolvedValue(fullDay);
    auth.mockResolvedValue({ user: { userId: 9, role: REMOTE_AGENT } });
    nowPstAsUtc.mockReturnValue(t('06:00:00'));
    const res = await post('clockOut');
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('accepts a normal clock-out after clock-in', async () => {
    findFirst.mockResolvedValue(fullDay);
    auth.mockResolvedValue({ user: { userId: 9, role: REMOTE_AGENT } });
    nowPstAsUtc.mockReturnValue(t('14:30:00'));
    const res = await post('clockOut');
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][0].data).toEqual({ clockOut: t('14:30:00') });
  });

  it('refuses any punch from a deactivated account', async () => {
    userFindUnique.mockResolvedValue({ status: true });
    auth.mockResolvedValue({ user: { userId: 9, role: REMOTE_AGENT } });
    nowPstAsUtc.mockReturnValue(t('07:00:00'));
    const res = await post('clockIn');
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('POST /api/clock/action — each employee\'s break order', () => {
  const clockedIn = {
    timeLogId: 1, clockIn: t('06:00:00'), firstBreakOut: null, firstBreakIn: null, lunchOut: null,
    lunchIn: null, secondBreakOut: null, secondBreakIn: null, clockOut: null,
  };
  beforeEach(() => {
    auth.mockResolvedValue({ user: { userId: 9, role: REMOTE_AGENT } });
    nowPstAsUtc.mockReturnValue(t('09:00:00'));
  });

  it('lets Janice start lunch before her first break', async () => {
    userFindUnique.mockResolvedValue({ status: false, isPartTime: false, breakOrder: 'lunch,firstBreak,secondBreak' });
    findFirst.mockResolvedValue(clockedIn);
    const res = await post('lunchOut');
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][0].data).toEqual({ lunchOut: t('09:00:00') });
  });

  it('still makes everyone else take their first break before lunch', async () => {
    userFindUnique.mockResolvedValue({ status: false, isPartTime: false, breakOrder: null });
    findFirst.mockResolvedValue(clockedIn);
    expect((await post('lunchOut')).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a lunch for a part-timer', async () => {
    userFindUnique.mockResolvedValue({ status: false, isPartTime: true, breakOrder: null });
    findFirst.mockResolvedValue({ ...clockedIn, firstBreakOut: t('08:00:00'), firstBreakIn: t('08:10:00') });
    const res = await post('lunchOut');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not part of your breaks/);
    expect(update).not.toHaveBeenCalled();
  });

  it('lets a part-timer clock out right after their one break', async () => {
    userFindUnique.mockResolvedValue({ status: false, isPartTime: true, breakOrder: null });
    findFirst.mockResolvedValue({ ...clockedIn, firstBreakOut: t('08:00:00'), firstBreakIn: t('08:10:00') });
    nowPstAsUtc.mockReturnValue(t('10:00:00'));
    expect((await post('clockOut')).status).toBe(200);
  });

  it('does not let a part-timer clock out before taking their break', async () => {
    userFindUnique.mockResolvedValue({ status: false, isPartTime: true, breakOrder: null });
    findFirst.mockResolvedValue(clockedIn);
    expect((await post('clockOut')).status).toBe(400);
  });
});
