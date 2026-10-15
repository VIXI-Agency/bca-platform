'use client';

import { Card, CardContent } from '@/components/ui/card';
import { STATUS_CONFIG } from '../../_lib/constants';

interface StatusSummaryProps {
  summary: Record<string, number>;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
}

/** One count card per status; clicking a card filters the list to it. */
export function StatusSummary({ summary, statusFilter, setStatusFilter }: StatusSummaryProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {(
        [
          'working',
          'on_break',
          'at_lunch',
          'not_clocked_in',
          'clocked_out',
        ] as const
      ).map((st) => {
        const cfg = STATUS_CONFIG[st];
        return (
          <Card
            key={st}
            className="cursor-pointer transition-all hover:scale-[1.02]"
            onClick={() =>
              setStatusFilter(statusFilter === st ? 'all' : st)
            }
          >
            <CardContent className="flex items-center gap-3 py-4">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: cfg.bg }}
              >
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: cfg.color }}
                />
              </div>
              <div>
                <p
                  className="text-2xl font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {summary[st] || 0}
                </p>
                <p
                  className="text-xs font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {cfg.label}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
