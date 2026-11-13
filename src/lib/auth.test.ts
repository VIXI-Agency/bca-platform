import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';

const findUnique = vi.fn();
const findMany = vi.fn();
const update = vi.fn();

vi.mock('./prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
    rolePermission: {
      findMany: (...args: unknown[]) => findMany(...args),
    },
  },
}));

vi.mock('./rate-limit', () => ({
  rateLimit: () => ({ success: true, remaining: 4, resetAt: 0 }),
}));

const holder = vi.hoisted(() => ({
  authorize: undefined as
    | ((credentials: { email?: string; password?: string } | undefined) => Promise<{ id: string } | null>)
    | undefined,
}));

vi.mock('next-auth/providers/credentials', () => ({
  default: (config: { authorize: typeof holder.authorize }) => {
    holder.authorize = config.authorize;
    return config;
  },
}));

vi.mock('next-auth', () => ({
  default: () => ({
    handlers: {},
    signIn: async () => {},
    signOut: async () => {},
    auth: async () => null,
  }),
  CredentialsSignin: class CredentialsSignin extends Error {
    code = 'credentials';
  },
}));

await import('./auth');

const hash = bcrypt.hashSync('correct-horse', 4);

function account(password: string) {
  return {
    idUser: 7,
    name: 'Ada',
    lastname: 'L',
    email: 'ada@x.com',
    password,
    status: false,
    idRole: 3,
    smsAccess: false,
    role: { role: 'Agent' },
  };
}

async function authorize(password: string) {
  return holder.authorize!({ email: 'ada@x.com', password });
}

describe('login authorize', () => {
  beforeEach(() => {
    findUnique.mockReset();
    findMany.mockReset().mockResolvedValue([]);
    update.mockReset();
  });

  it('accepts a bcrypt password', async () => {
    findUnique.mockResolvedValue(account(hash));
    await expect(authorize('correct-horse')).resolves.toMatchObject({ id: '7' });
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a wrong password', async () => {
    findUnique.mockResolvedValue(account(hash));
    await expect(authorize('wrong-horse')).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a plaintext password that matches the stored value', async () => {
    findUnique.mockResolvedValue(account('correct-horse'));
    await expect(authorize('correct-horse')).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
