/**
 * Characterization test for the Time Management page, used as the safety net
 * for splitting page.tsx into modules (tasks/plan.md). It pins the rendered
 * HTML of all five tabs, including every print:/no-print class, so a
 * refactor that changes what the page renders fails here.
 *
 * Rendered with renderToStaticMarkup: effects don't run, so this covers each
 * tab's initial state (no employee selected) plus anything the mocked hooks
 * return. Tabs are mocked to render every panel at once.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const FIXED_NOW = new Date('2026-10-14T16:30:00.000Z'); // Wed 9:30 AM PDT
const originalTz = process.env.TZ;

const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), reset: vi.fn(), isPending: false, error: null });

const statuses = [
  {
    userId: 1, name: 'Ana Working', role: 3, isPartTime: false, status: 'working',
    clockIn: '1970-01-01T06:00:00.000Z', breakExceeded: false, isDisconnected: false,
  },
  {
    userId: 2, name: 'Ben Break', role: 3, isPartTime: true, status: 'on_break',
    clockIn: '1970-01-01T05:45:00.000Z', firstBreakOut: '1970-01-01T09:15:00.000Z',
    currentBreakStart: '1970-01-01T09:15:00.000Z', breakExceeded: true, isDisconnected: false,
  },
  {
    userId: 3, name: 'Cara Done', role: 2, isPartTime: false, status: 'clocked_out',
    clockIn: '1970-01-01T06:00:00.000Z', clockOut: '1970-01-01T14:30:00.000Z',
    breakExceeded: false, isDisconnected: true,
  },
];

const employees = [
  { userId: 1, name: 'Ana Working', email: 'ana@example.com', role: 3, isPartTime: false, payRate: 10, otPayRate: 15 },
  { userId: 3, name: 'Cara Done', email: 'cara@example.com', role: 2, isPartTime: false, payRate: null, otPayRate: null },
];

const history = [
  {
    timeLogId: 11, userId: 1, employeeName: 'Ana Working', date: '2026-10-12',
    clockIn: '1970-01-01T06:00:00.000Z', firstBreakOut: '1970-01-01T08:00:00.000Z', firstBreakIn: '1970-01-01T08:10:00.000Z',
    lunchOut: '1970-01-01T10:00:00.000Z', lunchIn: '1970-01-01T10:30:00.000Z',
    secondBreakOut: '1970-01-01T12:30:00.000Z', secondBreakIn: '1970-01-01T12:40:00.000Z',
    clockOut: '1970-01-01T14:30:00.000Z', paidHours: 8, disconnectedMinutes: 0,
  },
  {
    timeLogId: 12, userId: 3, employeeName: 'Cara Done', date: '2026-10-13',
    clockIn: '1970-01-01T06:00:00.000Z', firstBreakOut: null, firstBreakIn: null,
    lunchOut: '1970-01-01T10:00:00.000Z', lunchIn: '1970-01-01T10:30:00.000Z',
    secondBreakOut: null, secondBreakIn: null,
    clockOut: '1970-01-01T16:00:00.000Z', paidHours: 9.25, disconnectedMinutes: 15,
  },
];

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: 1 } }, status: 'authenticated' }),
}));
vi.mock('@/components/layout/header', () => ({
  default: ({ title }: { title: string }) => createElement('h1', null, title),
}));
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  TabsList: ({ children }: { children: ReactNode }) => createElement('nav', null, children),
  TabsTrigger: ({ children, value }: { children: ReactNode; value: string }) =>
    createElement('button', { 'data-trigger': value }, children),
  TabsContent: ({ children, value }: { children: ReactNode; value: string }) =>
    createElement('section', { 'data-tab': value }, children),
}));
vi.mock('@/hooks/use-admin-time', async () => ({
  ...(await vi.importActual<typeof import('@/hooks/use-admin-time')>('@/hooks/use-admin-time')),
  useEmployeeStatuses: () => ({ data: statuses, isLoading: false, dataUpdatedAt: FIXED_NOW.getTime() }),
  useEmployeeList: () => ({ data: employees, isLoading: false }),
  useEmployeeTimesheet: () => ({ data: undefined, isLoading: false }),
  useTimeHistory: () => ({ data: history, isLoading: false }),
  useDisconnections: () => ({ data: undefined, isLoading: false }),
  usePeriodAudits: () => ({ data: undefined, isLoading: false }),
  useBonus: () => ({ data: undefined, isLoading: false }),
  useEditTime: mutation,
  useDisconnectEmployee: mutation,
  useUpdatePayRate: mutation,
  useSaveBonus: mutation,
}));

let html = '';

beforeAll(async () => {
  process.env.TZ = 'America/Los_Angeles';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED_NOW);
  const { default: AdminTimePage } = await import('./page');
  html = renderToStaticMarkup(createElement(AdminTimePage));
});

afterAll(() => {
  vi.useRealTimers();
  process.env.TZ = originalTz;
});

/** The HTML of one tab panel, from the mocked TabsContent wrapper. */
const tab = (value: string) => {
  const start = html.indexOf(`<section data-tab="${value}">`);
  if (start < 0) throw new Error(`tab ${value} not rendered`);
  const end = html.indexOf('</section>', start);
  return html.slice(start, end + '</section>'.length);
};

describe('Time Management page — rendered output (refactor safety net)', () => {
  it('renders all five tabs', () => {
    for (const value of ['status', 'edit', 'history', 'audit', 'report']) {
      expect(html).toContain(`<section data-tab="${value}">`);
    }
  });

  it.each(['status', 'edit', 'history', 'audit', 'report'])('keeps the %s tab markup unchanged', (value) => {
    expect(tab(value)).toMatchSnapshot();
  });

  it('keeps the page shell (header and tab triggers) unchanged', () => {
    expect(html.slice(0, html.indexOf('<section'))).toMatchSnapshot();
  });
});
