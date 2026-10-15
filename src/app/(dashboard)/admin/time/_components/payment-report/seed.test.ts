import { describe, it, expect } from 'vitest';
import { nextSeed } from './seed';

const saved = { discretionaryBonus: 25 };

describe('nextSeed', () => {
  it('blanks the inputs while a newly selected period is still loading', () => {
    expect(nextSeed(null, '1|2026-10-09', undefined)).toEqual({ key: 'loading:1|2026-10-09', from: undefined });
  });

  it('does nothing more while that period keeps loading', () => {
    expect(nextSeed('loading:1|2026-10-09', '1|2026-10-09', undefined)).toBeNull();
  });

  it('fills the inputs from the saved values once they arrive', () => {
    expect(nextSeed('loading:1|2026-10-09', '1|2026-10-09', saved)).toEqual({ key: '1|2026-10-09', from: saved });
  });

  it('never overwrites what is typed when the same period refetches (e.g. after Save)', () => {
    expect(nextSeed('1|2026-10-09', '1|2026-10-09', { discretionaryBonus: 30 })).toBeNull();
  });

  it('re-seeds when the admin picks another employee or period', () => {
    expect(nextSeed('1|2026-10-09', '2|2026-10-09', saved)).toEqual({ key: '2|2026-10-09', from: saved });
    expect(nextSeed('1|2026-10-09', '1|2026-10-02', undefined)).toEqual({ key: 'loading:1|2026-10-02', from: undefined });
  });
});
