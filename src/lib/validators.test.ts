import { describe, it, expect } from 'vitest';
import { clockWeekSchema, createUserSchema, updateUserSchema } from './validators';

describe('calendarDate (via clockWeekSchema.week)', () => {
  it('accepts a real YYYY-MM-DD date', () => {
    expect(clockWeekSchema.safeParse({ week: '2026-10-09' }).success).toBe(true);
  });

  it('rejects an impossible date', () => {
    expect(clockWeekSchema.safeParse({ week: '2026-02-30' }).success).toBe(false);
  });

  it('rejects a malformed string instead of throwing', () => {
    expect(() => clockWeekSchema.safeParse({ week: 'oct-9' })).not.toThrow();
    expect(clockWeekSchema.safeParse({ week: 'oct-9' }).success).toBe(false);
    expect(clockWeekSchema.safeParse({ week: '2026-1-9' }).success).toBe(false);
  });

  it('allows the week to be omitted', () => {
    expect(clockWeekSchema.safeParse({}).success).toBe(true);
  });
});

describe('clockInStart (user schemas)', () => {
  const newUser = { name: 'A', lastname: 'B', email: 'a@x.com', password: 'secret123', roleId: 3 };

  it.each([[240], [300], [360], [420], [480], [540], [null]])('accepts %s', (clockInStart) => {
    expect(createUserSchema.safeParse({ ...newUser, clockInStart }).success).toBe(true);
    expect(updateUserSchema.safeParse({ clockInStart }).success).toBe(true);
  });

  it('is optional', () => {
    expect(createUserSchema.parse(newUser).clockInStart).toBeUndefined();
    expect(updateUserSchema.parse({}).clockInStart).toBeUndefined();
  });

  it.each([[0], [180], [315], [600], [-300], [300.5], ['300'], [true]])('rejects %j', (clockInStart) => {
    expect(createUserSchema.safeParse({ ...newUser, clockInStart }).success).toBe(false);
    expect(updateUserSchema.safeParse({ clockInStart }).success).toBe(false);
  });
});
