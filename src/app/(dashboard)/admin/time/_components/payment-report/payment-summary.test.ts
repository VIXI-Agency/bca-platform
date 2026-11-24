/**
 * Pay is hours (each day rounded to 2 decimals) × rate. The summary shows
 * those same decimal hours so its multiplication checks out on paper:
 * "20h 08m × $7.00 = $140.98" did not (20h 08m × $7.00 is $140.93).
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaymentSummary } from './payment-summary';

const noBonus = {
  discretionaryBonus: 0, collectionsBonus: 0, trainingBonus: 0, managerBonus: 0, holidayPay: 0,
  wheelSpins: 0, ccfSpiffs: 0, accounts: 0, reloads: 0, verifiedLeads: 0,
};
const totals = (totalHours: number, overtime: number) =>
  ({ totalHours, overtime, firstBreakExcess: 0, secondBreakExcess: 0, disconnectedMinutes: 0 });

const render = (props: Partial<Parameters<typeof PaymentSummary>[0]>) =>
  renderToStaticMarkup(createElement(PaymentSummary, {
    totals: totals(20.14, 0), payRate: 7, otPayRate: null, regularPay: 140.98, otPay: 0,
    otRateMissing: false, bonusAmounts: noBonus, totalPay: 140.98, ...props,
  }));

describe('PaymentSummary', () => {
  it('shows the decimal hours that were actually multiplied', () => {
    const html = render({});
    expect(html).toContain('Regular (20.14 h × $7.00)');
    expect(html).toContain('$140.98');
    expect(html).not.toContain('20h 08m');
  });

  it('shows overtime the same way', () => {
    const html = render({ totals: totals(40, 2.5), otPayRate: 10.5, otPay: 26.25, regularPay: 280, totalPay: 306.25 });
    expect(html).toContain('Overtime (2.50 h × $10.50)');
  });

  it('lists a dated bonus on one line per category, with every day and amount', () => {
    const html = render({
      bonusAmounts: { ...noBonus, wheelSpins: 21, ccfSpiffs: 5, discretionaryBonus: 25 },
      bonusEntries: [
        { id: 1, category: 'wheelSpins', date: '2026-10-12', amount: 14 },
        { id: 2, category: 'wheelSpins', date: '2026-10-12', amount: 7 },
        { id: 3, category: 'ccfSpiffs', date: '2026-10-13', amount: 5 },
      ],
      totalPay: 191.98,
    });
    expect(html).toContain('Discretionary Bonus');
    // One line each (keeps a full week of spiffs from pushing the PDF to a 2nd page).
    expect(html).toContain('Wheel Spins — Mon 10/12 $14.00 · Mon 10/12 $7.00');
    expect(html).toContain('$21.00');
    expect(html).toContain('CCF Spiffs — Tue 10/13 $5.00');
    expect(html.match(/Wheel Spins/g)).toHaveLength(1);
  });

  it('leaves a dated category out when it has no entries', () => {
    expect(render({ bonusEntries: [] })).not.toContain('Wheel Spins');
  });

  it('shows how many accounts and verified leads next to their label', () => {
    const html = render({
      bonusAmounts: { ...noBonus, accounts: 15, verifiedLeads: 20, reloads: 5 },
      bonusCounts: { accounts: 4, verifiedLeads: 1 },
      totalPay: 180.98,
    });
    expect(html).toContain('Accounts (4)');
    expect(html).toContain('$15.00');
    expect(html).toContain('Verified Leads (1)');
    expect(html).toContain('Reloads Spiffs');
    expect(html).not.toContain('Reloads Spiffs (');
  });

  it('shows Holiday Pay with its day, hours and rate, right after Manager Bonus', () => {
    const html = render({
      bonusAmounts: { ...noBonus, managerBonus: 5, holidayPay: 56, accounts: 15 },
      bonusEntries: [{ id: 1, category: 'holidayPay', date: '2026-11-26', amount: 0, hours: 8 }],
      bonusHours: { holidayPay: 8 },
      totalPay: 216.98,
    });
    expect(html).toContain('Holiday Pay — Thu 11/26 8 h × $7.00');
    expect(html).toContain('$56.00');
    expect(html.match(/Holiday Pay/g)).toHaveLength(1);
    expect(html.indexOf('Manager Bonus')).toBeLessThan(html.indexOf('Holiday Pay'));
    expect(html.indexOf('Holiday Pay')).toBeLessThan(html.indexOf('Accounts'));
  });

  it('lists every holiday on one line, with the total hours that were multiplied', () => {
    const html = render({
      bonusAmounts: { ...noBonus, holidayPay: 112 },
      bonusEntries: [
        { id: 1, category: 'holidayPay', date: '2026-11-26', amount: 0, hours: 8 },
        { id: 2, category: 'holidayPay', date: '2026-11-28', amount: 0, hours: 8 },
      ],
      bonusHours: { holidayPay: 16 },
      totalPay: 252.98,
    });
    expect(html).toContain('Holiday Pay — Thu 11/26 8 h · Sat 11/28 8 h (16 h × $7.00)');
    expect(html).toContain('$112.00');
    expect(html).not.toContain('$0.00');
  });

  it('leaves Holiday Pay out when there are no holiday entries', () => {
    expect(render({ bonusHours: { holidayPay: null } })).not.toContain('Holiday Pay');
  });

  it('prints each custom bonus under the name payroll typed, after the other bonuses', () => {
    const html = render({
      bonusAmounts: { ...noBonus, verifiedLeads: 20 },
      customBonuses: [{ id: 1, name: 'Raffle', amount: 50 }, { id: 2, name: 'Birthday Bonus', amount: 25.5 }],
      totalPay: 236.48,
    });
    expect(html).toContain('Raffle');
    expect(html).toContain('$50.00');
    expect(html).toContain('Birthday Bonus');
    expect(html).toContain('$25.50');
    expect(html.indexOf('Verified Leads')).toBeLessThan(html.indexOf('Raffle'));
    expect(html.indexOf('Raffle')).toBeLessThan(html.indexOf('Birthday Bonus'));
    expect(html.indexOf('Birthday Bonus')).toBeLessThan(html.indexOf('Total Payment'));
  });

  it('prints the week’s note under the total, keeping its line breaks', () => {
    const html = render({ notes: 'Covered two extra shifts.\nGreat week!' });
    expect(html).toContain('Notes');
    expect(html).toContain('Covered two extra shifts.\nGreat week!');
    expect(html).toContain('whitespace-pre-line');
    expect(html.indexOf('Total Payment')).toBeLessThan(html.indexOf('Covered two extra shifts.'));
  });

  it('has no notes block without a note', () => {
    expect(render({ notes: null })).not.toContain('Notes');
    expect(render({ notes: '' })).not.toContain('Notes');
  });

  it('shows unpaid overtime in decimal hours too', () => {
    const html = render({ totals: totals(8, 1.25), otRateMissing: true, regularPay: 56, totalPay: 56 });
    expect(html).toContain('Overtime (1.25 h) — not paid: no OT rate set');
  });
});
