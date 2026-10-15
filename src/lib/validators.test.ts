import { describe, it, expect } from 'vitest';
import { clockWeekSchema } from './validators';

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
