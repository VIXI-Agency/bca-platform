/**
 * Holiday Pay is the one bonus typed in hours: the editor shows what those
 * hours pay at the rate being typed, and says so when nothing will be paid.
 */
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The dated lists load and save on their own (react-query); not under test here.
vi.mock('./dated-bonus-list', () => ({ DatedBonusList: () => null }));

const { BonusEditor } = await import('./bonus-editor');

const blank = {
  discretionaryBonus: '', collectionsBonus: '', trainingBonus: '', managerBonus: '',
  accounts: '', reloads: '', verifiedLeads: '',
};

const render = (holidayHours: string, payRate: number | null) =>
  renderToStaticMarkup(createElement(BonusEditor, {
    bonusInputs: blank, setBonusInputs: () => {},
    countInputs: { accounts: '', verifiedLeads: '' }, setCountInputs: () => {},
    hoursInputs: { holidayPay: holidayHours }, setHoursInputs: () => {},
    payRate,
    notesInput: '', setNotesInput: () => {},
    bonusIsDirty: false, bonusLoading: false, handleSaveBonus: () => {},
    saveBonus: { isPending: false, error: null },
    userId: 7, bonusEntries: [], bonusDays: [], locked: false,
  }));

describe('BonusEditor — Holiday Pay', () => {
  it('sits right after Manager Bonus and is typed in whole hours', () => {
    const html = render('', 7);
    expect(html).toContain('Holiday Pay (hours)');
    expect(html.indexOf('Manager Bonus')).toBeLessThan(html.indexOf('Holiday Pay'));
    expect(html.indexOf('Holiday Pay')).toBeLessThan(html.indexOf('Accounts'));
    expect(html).toMatch(/id="report-bonus-holidayPay"[^>]*step="1"/);
  });

  it('shows what the hours pay at the typed rate', () => {
    expect(render('8', 7)).toContain('8 h × $7.00 = $56.00');
  });

  it('warns when there is no pay rate to pay the hours at', () => {
    const html = render('8', null);
    expect(html).toContain('Set a pay rate, or Holiday Pay won&#x27;t be paid.');
    expect(html).not.toContain('= $');
  });

  it('warns about decimals instead of silently dropping them', () => {
    expect(render('7.5', 7)).toContain('Whole hours only');
  });

  it('says nothing while the field is empty', () => {
    const html = render('', null);
    expect(html).not.toContain('Set a pay rate');
    expect(html).not.toContain('Whole hours only');
  });
});
