/**
 * Holiday Pay is entered per day, like Wheel Spins and CCF Spiffs: it has its
 * own list under the grid, with the whole pay period to pick a day from.
 */
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The dated lists load and save on their own (react-query). Here they only
// report what the editor handed them.
vi.mock('./dated-bonus-list', () => ({
  DatedBonusList: (p: { category: string; days: string[]; payRate: number | null; entries: unknown[] }) =>
    createElement('div', { 'data-list': p.category }, `${p.category}|days=${p.days.join(',')}|rate=${p.payRate}|n=${p.entries.length}`),
}));

vi.mock('./custom-bonus-list', () => ({
  CustomBonusList: (p: { week: string; bonuses: unknown[]; suggestions: string[] }) =>
    createElement('div', { 'data-custom': 'yes' }, `custom|week=${p.week}|n=${p.bonuses.length}|suggest=${p.suggestions.join(',')}`),
}));

const { BonusEditor } = await import('./bonus-editor');

const blank = {
  discretionaryBonus: '', collectionsBonus: '', trainingBonus: '', managerBonus: '',
  accounts: '', reloads: '', verifiedLeads: '',
};

const html = renderToStaticMarkup(createElement(BonusEditor, {
  bonusInputs: blank, setBonusInputs: () => {},
  countInputs: { accounts: '', verifiedLeads: '' }, setCountInputs: () => {},
  payRate: 15,
  notesInput: '', setNotesInput: () => {},
  bonusIsDirty: false, bonusLoading: false, handleSaveBonus: () => {},
  saveBonus: { isPending: false, error: null },
  userId: 7,
  bonusEntries: [
    { id: 1, category: 'holidayPay', date: '2026-11-26', amount: 0, hours: 8 },
    { id: 2, category: 'wheelSpins', date: '2026-11-23', amount: 7 },
  ],
  bonusDays: ['2026-11-20', '2026-11-23'],
  periodDays: ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'],
  week: '2026-11-20',
  customBonuses: [{ id: 5, name: 'Raffle', amount: 50 }],
  customSuggestions: ['Raffle', 'Birthday Bonus'],
  locked: false,
}));

describe('BonusEditor — Holiday Pay', () => {
  it('is no longer a box in the amounts grid', () => {
    expect(html).not.toContain('report-bonus-holidayPay');
    expect(html).toContain('report-bonus-managerBonus');
  });

  it('has its own dated list, before Wheel Spins and CCF Spiffs', () => {
    const order = [...html.matchAll(/data-list="(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['holidayPay', 'wheelSpins', 'ccfSpiffs']);
  });

  it('can go on any day of the pay period, weekends and upcoming days included', () => {
    expect(html).toContain('holidayPay|days=2026-11-20,2026-11-21,2026-11-22,2026-11-23,2026-11-24,2026-11-25,2026-11-26|rate=15|n=1');
  });

  it('offers custom bonuses after the dated lists, for the selected pay period', () => {
    expect(html).toContain('custom|week=2026-11-20|n=1|suggest=Raffle,Birthday Bonus');
    expect(html.indexOf('data-list="ccfSpiffs"')).toBeLessThan(html.indexOf('data-custom'));
  });

  it('leaves Wheel Spins and CCF Spiffs on workdays already past', () => {
    expect(html).toContain('wheelSpins|days=2026-11-20,2026-11-23|rate=15|n=1');
    expect(html).toContain('ccfSpiffs|days=2026-11-20,2026-11-23|rate=15|n=0');
  });
});
