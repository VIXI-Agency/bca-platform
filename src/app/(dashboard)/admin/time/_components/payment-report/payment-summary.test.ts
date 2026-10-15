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
  discretionaryBonus: 0, collectionsBonus: 0, trainingBonus: 0, managerBonus: 0,
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

  it('shows unpaid overtime in decimal hours too', () => {
    const html = render({ totals: totals(8, 1.25), otRateMissing: true, regularPay: 56, totalPay: 56 });
    expect(html).toContain('Overtime (1.25 h) — not paid: no OT rate set');
  });
});
