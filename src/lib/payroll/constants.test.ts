import { describe, it, expect } from 'vitest';
import {
  datedBonusRuleError,
  bonusCount,
  PERIOD_BONUS_FIELDS,
  DATED_BONUS_CATEGORIES,
  COUNTED_BONUS_FIELDS,
  BONUS_FIELDS,
  BONUS_FIELD_LABELS,
} from './constants';

const entry = (category: string, entryDate: string) => ({ category, entryDate });

describe('datedBonusRuleError', () => {
  it('allows up to 2 Wheel Spins per pay period, on the same day if needed', () => {
    expect(datedBonusRuleError('wheelSpins', '2026-10-12', [])).toBeNull();
    expect(datedBonusRuleError('wheelSpins', '2026-10-12', [entry('wheelSpins', '2026-10-12')])).toBeNull();
  });

  it('refuses a third Wheel Spin', () => {
    const two = [entry('wheelSpins', '2026-10-09'), entry('wheelSpins', '2026-10-12')];
    expect(datedBonusRuleError('wheelSpins', '2026-10-13', two)).toBe('Wheel Spins: at most 2 per pay period.');
  });

  it('allows one CCF Spiff per day, up to 5', () => {
    const four = ['2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14'].map((d) => entry('ccfSpiffs', d));
    expect(datedBonusRuleError('ccfSpiffs', '2026-10-15', four)).toBeNull();
  });

  it('refuses a second CCF Spiff on the same day and a sixth one', () => {
    expect(datedBonusRuleError('ccfSpiffs', '2026-10-12', [entry('ccfSpiffs', '2026-10-12')])).toBe('CCF Spiffs: only one per day.');
    const five = ['2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'].map((d) => entry('ccfSpiffs', d));
    expect(datedBonusRuleError('ccfSpiffs', '2026-10-15', five)).toBe('CCF Spiffs: at most 5 per pay period.');
  });

  it('counts each category on its own', () => {
    const two = [entry('wheelSpins', '2026-10-09'), entry('wheelSpins', '2026-10-12')];
    expect(datedBonusRuleError('ccfSpiffs', '2026-10-12', two)).toBeNull();
  });
});

describe('bonusCount', () => {
  it('uses the typed count when there is an amount', () => {
    expect(bonusCount(4, 15)).toBe(4);
  });

  it('shows (1) when an amount was typed without a count', () => {
    expect(bonusCount(null, 15)).toBe(1);
    expect(bonusCount(0, 15)).toBe(1);
  });

  it('has no count when there is no amount (a count alone is not paid or shown)', () => {
    expect(bonusCount(4, 0)).toBeNull();
    expect(bonusCount(null, 0)).toBeNull();
  });
});

describe('labels', () => {
  it('calls Reloads "Reloads Spiffs"', () => {
    expect(BONUS_FIELD_LABELS.reloads).toBe('Reloads Spiffs');
  });

  it('counts Accounts and Verified Leads', () => {
    expect([...COUNTED_BONUS_FIELDS]).toEqual(['accounts', 'verifiedLeads']);
  });
});

describe('bonus categories', () => {
  it('split every category into exactly one of: typed per period, or dated', () => {
    expect([...PERIOD_BONUS_FIELDS, ...DATED_BONUS_CATEGORIES].sort()).toEqual([...BONUS_FIELDS].sort());
  });
});
