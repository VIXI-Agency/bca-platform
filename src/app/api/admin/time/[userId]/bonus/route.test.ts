import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = { value: { user: { role: 1, userId: 262 } } as unknown };
const findUnique = vi.fn();
const upsert = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: async () => session.value }));
const scheduleFindMany = vi.fn<(...a: unknown[]) => Promise<unknown[]>>(async () => []);
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userPaySchedule: { findMany: (...a: unknown[]) => scheduleFindMany(...a) },
    payrollBonus: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      upsert: (...a: unknown[]) => upsert(...a),
    },
  },
}));
vi.mock('@/lib/payroll/compute', () => ({ isPeriodLocked: async () => false }));

const { GET, PUT } = await import('./route');

const params = { params: Promise.resolve({ userId: '40' }) };
const put = (body: unknown) =>
  PUT(new Request('http://localhost/api/admin/time/40/bonus', { method: 'PUT', body: JSON.stringify(body) }), params);

beforeEach(() => {
  vi.clearAllMocks();
  session.value = { user: { role: 1, userId: 262 } };
  upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => create);
});

describe('/api/admin/time/[userId]/bonus — counts', () => {
  it('saves how many accounts and verified leads the amounts are for', async () => {
    const res = await put({ period: '2026-10-09', accounts: 15, accountsCount: 4, verifiedLeads: 20, verifiedLeadsCount: 10 });
    expect(res.status).toBe(200);
    const { create, update } = upsert.mock.calls[0][0];
    expect(create).toMatchObject({ accounts: 15, accountsCount: 4, verifiedLeads: 20, verifiedLeadsCount: 10 });
    expect(update).toMatchObject({ accountsCount: 4, verifiedLeadsCount: 10 });
    expect(await res.json()).toMatchObject({ accounts: 15, accountsCount: 4, verifiedLeadsCount: 10 });
  });

  it('clears a count that was left blank', async () => {
    await put({ period: '2026-10-09', accounts: 15, accountsCount: null });
    expect(upsert.mock.calls[0][0].update.accountsCount).toBeNull();
    expect(upsert.mock.calls[0][0].update.verifiedLeadsCount).toBeNull();
  });

  it.each([1.5, -1, 1000])('rejects a count of %s', async (accountsCount) => {
    expect((await put({ period: '2026-10-09', accounts: 15, accountsCount })).status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns the saved counts', async () => {
    findUnique.mockResolvedValue({ accounts: '13.00', accountsCount: null, verifiedLeads: '20.00', verifiedLeadsCount: 10 });
    const res = await GET(new Request('http://localhost/api/admin/time/40/bonus?week=2026-10-09'), params);
    expect(await res.json()).toMatchObject({ accounts: 13, accountsCount: null, verifiedLeads: 20, verifiedLeadsCount: 10 });
  });
});
