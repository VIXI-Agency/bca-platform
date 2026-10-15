'use client';

import { useState, useEffect } from 'react';
import { elapsedMinutes, formatMinutes } from '../_lib/format';

export function LiveTimer({ start, warn }: { start?: string | null; warn?: boolean }) {
  const [mins, setMins] = useState(() => elapsedMinutes(start));

  useEffect(() => {
    if (!start) return;
    setMins(elapsedMinutes(start));
    const id = setInterval(() => setMins(elapsedMinutes(start)), 15000);
    return () => clearInterval(id);
  }, [start]);

  if (!start) return null;

  const exceeded = warn && mins > 10;

  return (
    <span
      className={`text-xs font-medium ${exceeded ? 'rounded bg-red-500/10 px-1.5 py-0.5 text-red-400' : 'text-[var(--text-secondary)]'}`}
    >
      {formatMinutes(mins)}
      {exceeded && ' (exceeded)'}
    </span>
  );
}
