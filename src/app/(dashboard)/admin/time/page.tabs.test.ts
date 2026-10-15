/**
 * Radix unmounts an inactive tab, which threw away the Payment Report's
 * selected employee, typed rate and unsaved bonuses whenever the admin
 * looked at another tab. The report tab must stay mounted and only hide.
 */
import { describe, it, expect, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const contentProps: Record<string, { forceMount?: boolean; className?: string }> = {};

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: 1 } } }) }));
vi.mock('@/components/layout/header', () => ({ default: () => null }));
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  TabsList: () => null,
  TabsTrigger: () => null,
  TabsContent: (props: { value: string; forceMount?: boolean; className?: string }) => {
    contentProps[props.value] = props;
    return null;
  },
}));

describe('Time Management tabs', () => {
  it('keeps the Payment Report mounted while another tab is open', async () => {
    const { default: AdminTimePage } = await import('./page');
    renderToStaticMarkup(createElement(AdminTimePage));

    expect(contentProps.report.forceMount).toBe(true);
    expect(contentProps.report.className).toContain('data-[state=inactive]:hidden');
  });
});
