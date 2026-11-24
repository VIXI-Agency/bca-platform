import { describe, it, expect } from 'vitest';
import {
  datedBonusRuleError,
  bonusCount,
  PERIOD_BONUS_FIELDS,
  DATED_BONUS_CATEGORIES,
  COUNTED_BONUS_FIELDS,
  BONUS_FIELDS,
  BONUS_FIELD_LABELS,
  HOURS_BONUS_FIELDS,
  DATED_BONUS_RULES,
  isHoursBonus,
  hoursBonusAmount,
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

  it('allows one Holiday Pay entry per day, with no cap on how many days', () => {
    const week = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25'].map((d) => entry('holidayPay', d));
    expect(datedBonusRuleError('holidayPay', '2026-11-26', week)).toBeNull();
    expect(datedBonusRuleError('holidayPay', '2026-11-25', week)).toBe('Holiday Pay: only one per day.');
  });

  it('lets only Holiday Pay land on a weekend or an upcoming day', () => {
    expect(DATED_BONUS_RULES.holidayPay.anyDay).toBe(true);
    expect(DATED_BONUS_RULES.wheelSpins.anyDay).toBe(false);
    expect(DATED_BONUS_RULES.ccfSpiffs.anyDay).toBe(false);
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

  it('lists Holiday Pay right after Manager Bonus', () => {
    expect(BONUS_FIELDS.indexOf('holidayPay')).toBe(BONUS_FIELDS.indexOf('managerBonus') + 1);
    expect(BONUS_FIELD_LABELS.holidayPay).toBe('Holiday Pay');
  });

  it('enters Holiday Pay per day, in hours', () => {
    expect(isHoursBonus('holidayPay')).toBe(true);
    expect(isHoursBonus('managerBonus')).toBe(false);
    expect(isHoursBonus('wheelSpins')).toBe(false);
    expect([...DATED_BONUS_CATEGORIES]).toContain('holidayPay');
    expect([...HOURS_BONUS_FIELDS]).toEqual(['holidayPay']);
  });
});

describe('hoursBonusAmount', () => {
  it('pays the hours at the pay rate, to the cent', () => {
    expect(hoursBonusAmount(8, 7)).toBe(56);
    expect(hoursBonusAmount(8, 7.33)).toBe(58.64);
  });

  it('pays nothing without hours', () => {
    expect(hoursBonusAmount(0, 7)).toBe(0);
    expect(hoursBonusAmount(null, 7)).toBe(0);
    expect(hoursBonusAmount(undefined, 7)).toBe(0);
  });

  it('pays nothing without a pay rate', () => {
    expect(hoursBonusAmount(8, null)).toBe(0);
  });
});
