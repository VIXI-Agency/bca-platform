/**
 * The dated list in its two modes: dollars (Wheel Spins, CCF Spiffs) and
 * hours paid at the pay rate (Holiday Pay).
 */
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const idle = { mutateAsync: async () => {}, isPending: false, error: null };
vi.mock('@/hooks/use-admin-time', () => ({ useAddBonusEntry: () => idle, useRemoveBonusEntry: () => idle }));

const { DatedBonusList } = await import('./dated-bonus-list');

const render = (props: Partial<Parameters<typeof DatedBonusList>[0]>) =>
  renderToStaticMarkup(createElement(DatedBonusList, {
    userId: 7, category: 'holidayPay', entries: [], days: ['2026-11-26', '2026-11-28'], payRate: 15, locked: false, ...props,
  }));
const thanksgiving = { id: 1, category: 'holidayPay' as const, date: '2026-11-26', amount: 0, hours: 8 };

describe('DatedBonusList — Holiday Pay', () => {
  it('asks for a day and whole hours, with no cap shown', () => {
    const html = render({});
    expect(html).toContain('Holiday Pay (hours)');
    expect(html).toContain('one per day');
    expect(html).not.toMatch(/\d of \d/);
    expect(html).toMatch(/aria-label="Holiday Pay hours"/);
    expect(html).toMatch(/step="1"/);
    expect(html).toContain('placeholder="0 h"');
  });

  it('lists each day with its hours and what they pay at the rate', () => {
    const html = render({ entries: [thanksgiving] });
    expect(html).toContain('Thu 11/26');
    expect(html).toContain('8 h');
    expect(html).toContain('$120.00');
  });

  it('warns when there is no pay rate to pay the hours at', () => {
    const html = render({ entries: [thanksgiving], payRate: null });
    expect(html).toContain('Set a pay rate, or Holiday Pay won&#x27;t be paid.');
    expect(html).not.toContain('$');
  });

  it('says nothing about the rate while there are no entries', () => {
    expect(render({ payRate: null })).not.toContain('Set a pay rate');
  });

  it('keeps the entries but hides add and remove once the period is locked', () => {
    const html = render({ entries: [thanksgiving], locked: true });
    expect(html).toContain('Thu 11/26');
    expect(html).not.toContain('aria-label="Holiday Pay hours"');
    expect(html).not.toContain('Remove Holiday Pay');
  });
});

describe('DatedBonusList — dollar categories', () => {
  it('still asks Wheel Spins for an amount and shows its cap', () => {
    const html = render({ category: 'wheelSpins', entries: [{ id: 2, category: 'wheelSpins', date: '2026-11-26', amount: 7 }] });
    expect(html).toContain('1 of 2');
    expect(html).toContain('$7.00');
    expect(html).toMatch(/aria-label="Wheel Spins amount"/);
    expect(html).toMatch(/step="0.01"/);
    expect(html).not.toContain('(hours)');
  });

  it('still shows CCF Spiffs as one per day, up to 5', () => {
    expect(render({ category: 'ccfSpiffs' })).toContain('0 of 5 · one per day');
  });
});
