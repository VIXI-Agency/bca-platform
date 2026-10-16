'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { useCancelPaySchedule, usePaySchedule, useSetPaySchedule } from '@/hooks/use-pay-schedule';
import { PAY_SCHEDULE_LABELS, PERIOD_START_DAY, nextStartDay, type PaySchedule } from '@/lib/payroll/pay-schedule';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Today as YYYY-MM-DD in the viewer's own calendar. */
const localToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
};
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });

/**
 * Which pay week this user is on — remote (Fri–Thu) or In House (Mon–Fri) —
 * and switching it from a chosen Monday/Friday on. Saves on its own, separate
 * from "Update User".
 */
export const PayWeekSection = ({ userId }: { userId: number }) => {
  const { data, isLoading } = usePaySchedule(userId);
  const setSchedule = useSetPaySchedule();
  const cancel = useCancelPaySchedule();
  const [startInput, setStartInput] = useState('');

  if (isLoading || !data) {
    return (
      <div className="rounded-lg border border-[var(--border)] p-4">
        <Loading size="sm" />
      </div>
    );
  }

  const today = isoDay(localToday());
  const upcoming = data.changes.filter((c) => c.effectiveFrom > today);
  // The week type after every scheduled change; the switch offered is to the other one.
  const latest = data.changes.at(-1)?.schedule ?? data.current;
  const target: PaySchedule = latest === 'inhouse' ? 'remote' : 'inhouse';
  const start = startInput || isoDay(nextStartDay(target, localToday()));
  const startDay = DAY_NAMES[PERIOD_START_DAY[target]];
  const error = setSchedule.error ?? cancel.error;

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] p-4">
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Pay week: {PAY_SCHEDULE_LABELS[data.current]}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          This week: {data.currentPeriod}
        </p>
      </div>

      {upcoming.map((c) => (
        <div key={c.effectiveFrom} className="flex items-center justify-between gap-2 text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>
            {PAY_SCHEDULE_LABELS[c.schedule]} from {dayLabel(c.effectiveFrom)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate({ userId, effectiveFrom: c.effectiveFrom })}
          >
            Cancel
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Switch to {PAY_SCHEDULE_LABELS[target]} starting ({startDay})
          </p>
          <Input type="date" className="h-8 w-44" value={start} onChange={(e) => setStartInput(e.target.value)} />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={setSchedule.isPending || !start}
          onClick={() =>
            setSchedule.mutate(
              { userId, schedule: target, effectiveFrom: start },
              { onSuccess: () => setStartInput('') },
            )
          }
        >
          {setSchedule.isPending ? <Loading size="sm" /> : 'Save pay week'}
        </Button>
      </div>
      {error && <p className="text-xs text-red-500">{error.message}</p>}
    </div>
  );
};
