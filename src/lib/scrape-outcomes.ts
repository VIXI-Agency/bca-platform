/**
 * Plain-English names for how a scrape run ended.
 *
 * The database stores the worker's own vocabulary — 'budget', 'drift' — which
 * is precise for whoever wrote the worker and meaningless on an admin screen.
 * 'drift' in particular reads as an error nobody can act on, and it is the one
 * outcome that most needs to be understood.
 *
 * Shared rather than inlined in the page so the label, the explanation and the
 * grouping used by the filter can never disagree with each other.
 */

export type RunOutcome = 'target' | 'budget' | 'empty' | 'drift' | 'blocked';

/** Buckets the outcome filter offers. */
export type OutcomeGroup = 'all' | 'productive' | 'aborted' | 'idle';

export interface OutcomeInfo {
  label: string;
  /** One sentence on what actually happened, shown on hover. */
  explanation: string;
  tone: 'good' | 'neutral' | 'bad';
  group: Exclude<OutcomeGroup, 'all'>;
}

const OUTCOMES: Record<RunOutcome, OutcomeInfo> = {
  target: {
    label: 'Daily target hit',
    explanation: 'The run collected its full target of leads and stopped early. This is the best outcome.',
    tone: 'good',
    group: 'productive',
  },
  budget: {
    label: 'Time limit reached',
    explanation: 'The run used its full 4 hours and stopped with work still queued. Normal.',
    tone: 'good',
    group: 'productive',
  },
  empty: {
    label: 'Queue empty',
    explanation: 'Nothing left to search. Queue more industries and states above, or the next runs import nothing.',
    tone: 'neutral',
    group: 'idle',
  },
  blocked: {
    label: 'Aborted — blocked',
    explanation:
      'YellowPages refused most of this run\'s page requests, so it stopped early. Every search it kept trying would have burned three attempts and marked that city as failed. The worker waits longer before each retry until the block lifts; nothing was lost.',
    tone: 'bad',
    group: 'aborted',
  },
  drift: {
    label: 'Aborted — no results',
    explanation:
      'The first 10 searches all came back with zero listings, so the run stopped instead of burning through the queue. Usually blocked proxies; if it repeats for days, YellowPages changed its page layout.',
    tone: 'bad',
    group: 'aborted',
  },
};

const UNKNOWN: OutcomeInfo = {
  label: 'Unknown',
  explanation: 'The run finished without recording why it stopped.',
  tone: 'neutral',
  group: 'idle',
};

const STILL_RUNNING: OutcomeInfo = {
  label: 'Running',
  explanation: 'This run is in progress right now. Counts climb as it works.',
  tone: 'neutral',
  group: 'productive',
};

export function describeRun(status: string, finishReason: string | null): OutcomeInfo {
  if (status === 'running') return STILL_RUNNING;
  if (!finishReason) return UNKNOWN;
  return OUTCOMES[finishReason as RunOutcome] ?? UNKNOWN;
}

/** The finish reasons a filter bucket covers, for the query layer. */
export function reasonsInGroup(group: OutcomeGroup): RunOutcome[] | null {
  if (group === 'all') return null;
  return (Object.keys(OUTCOMES) as RunOutcome[]).filter((key) => OUTCOMES[key].group === group);
}

export const OUTCOME_GROUP_LABELS: Record<OutcomeGroup, string> = {
  all: 'All runs',
  productive: 'Productive',
  aborted: 'Aborted',
  idle: 'Nothing to do',
};

/** Which directory a search read. Stored as a short code, shown as a name. */
export type ScrapeSourceCode = 'yp' | 'sp';

export const SOURCE_LABELS: Record<string, string> = {
  yp: 'YellowPages',
  sp: 'SuperPages',
};
