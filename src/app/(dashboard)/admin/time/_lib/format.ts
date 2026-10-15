export function formatTime(time?: string | null): string {
  if (!time) return '--:--';
  let h: number, m: number;
  if (time.includes('T')) {
    const d = new Date(time);
    h = d.getUTCHours();
    m = d.getUTCMinutes();
  } else {
    [h, m] = time.split(':').map(Number);
  }
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

/** Compute break duration in minutes between out and in times. */
export function breakMinutes(out?: string | null, inTime?: string | null): number | null {
  if (!out || !inTime) return null;
  const toMs = (t: string) => {
    if (t.includes('T')) return new Date(t).getTime();
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const outMs = toMs(out);
  const inMs = toMs(inTime);
  if (typeof outMs === 'number' && typeof inMs === 'number') {
    // If both are epoch ms
    if (out.includes('T')) return Math.round((inMs - outMs) / 60000);
    return inMs - outMs; // already in minutes
  }
  return null;
}

/** Live elapsed minutes from a start time to now (PST-aware, max 24h). */
export function elapsedMinutes(start?: string | null): number {
  if (!start) return 0;
  // Start time is PST stored as UTC-labeled (e.g., 09:50 PST → T09:50:00.000Z)
  const d = new Date(start);
  const startMinOfDay = d.getUTCHours() * 60 + d.getUTCMinutes();
  // Get current PST time using Intl (handles DST automatically)
  const pstParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date());
  const nowH = parseInt(pstParts.find(p => p.type === 'hour')?.value ?? '0');
  const nowM = parseInt(pstParts.find(p => p.type === 'minute')?.value ?? '0');
  const nowMinOfDay = nowH * 60 + nowM;
  const diff = nowMinOfDay - startMinOfDay;
  // Clamp to 0..1440 (one day max) to prevent negative or astronomically large values
  return Math.max(0, Math.min(diff, 1440));
}

export function formatDuration(mins: number | null): string {
  if (mins === null) return '--:--';
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** A disconnection span for the audit trail: "8:54am–9:10am" or "8:54am–clock-out". */
export function formatSpan(span: { start: string; end: string | null } | null): string {
  if (!span) return '--';
  return `${formatTime(span.start)}–${span.end ? formatTime(span.end) : 'clock-out'}`;
}

export function formatMinutes(mins: number): string {
  return `${mins} min`;
}
