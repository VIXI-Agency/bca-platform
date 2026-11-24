/** The Custom Bonuses box: a name payroll types, an amount, up to 5 per pay period. */
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const idle = { mutateAsync: async () => {}, isPending: false, error: null };
vi.mock('@/hooks/use-admin-time', () => ({ useAddCustomBonus: () => idle, useRemoveCustomBonus: () => idle }));

const { CustomBonusList } = await import('./custom-bonus-list');

const render = (props: Partial<Parameters<typeof CustomBonusList>[0]>) =>
  renderToStaticMarkup(createElement(CustomBonusList, {
    userId: 7, week: '2026-11-20', bonuses: [], suggestions: ['Raffle', 'Birthday Bonus'], locked: false, ...props,
  }));
const five = ['A', 'B', 'C', 'D', 'E'].map((name, i) => ({ id: i + 1, name, amount: 10 }));

describe('CustomBonusList', () => {
  it('asks for a name and an amount, and offers the names used before', () => {
    const html = render({});
    expect(html).toContain('Custom Bonuses');
    expect(html).toContain('0 of 5');
    expect(html).toMatch(/aria-label="Custom bonus name"/);
    expect(html).toMatch(/maxLength="40"/i);
    expect(html).toMatch(/aria-label="Custom bonus amount"/);
    expect(html).toContain('<option value="Raffle"');
    expect(html).toContain('<option value="Birthday Bonus"');
  });

  it('lists each bonus with its name and amount', () => {
    const html = render({ bonuses: [{ id: 1, name: 'Raffle', amount: 50 }, { id: 2, name: 'Birthday Bonus', amount: 25.5 }] });
    expect(html).toContain('Raffle');
    expect(html).toContain('$50.00');
    expect(html).toContain('$25.50');
    expect(html).toContain('2 of 5');
    expect(html).toContain('aria-label="Remove Raffle"');
  });

  it('stops offering Add at 5', () => {
    const html = render({ bonuses: five });
    expect(html).toContain('5 of 5');
    expect(html).not.toContain('aria-label="Custom bonus name"');
  });

  it('keeps the bonuses but hides add and remove once the period is locked', () => {
    const html = render({ bonuses: [{ id: 1, name: 'Raffle', amount: 50 }], locked: true });
    expect(html).toContain('Raffle');
    expect(html).not.toContain('aria-label="Custom bonus name"');
    expect(html).not.toContain('aria-label="Remove Raffle"');
  });
});
