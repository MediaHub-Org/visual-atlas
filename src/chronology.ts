// Pure in-world chronology helpers: formatting a universe's own calendar, laying
// works out on an axis and checking a list order against the dates. No imports,
// so `node --test` can run it directly (tests/chronology.test.mjs).

export type Qualifier = 'exact' | 'circa' | 'open_after' | 'days_before';
export type Period = {
  label: string | null;
  start: number | null;
  end: number | null;
  qualifier: Qualifier;
  primary: boolean;
};
export type Calendar = {
  id: string;
  name: string;
  eraBefore: string;
  eraAfter: string;
  anchorEvent: string;
};

/** -32 -> "32 BBY", 0 -> "0 ABY", 9 -> "9 ABY" (the calendar has a year zero). */
export function formatYear(value: number, cal: Calendar): string {
  return value < 0 ? `${-value} ${cal.eraBefore}` : `${value} ${cal.eraAfter}`;
}

/** "22 BBY–19 BBY", "32 BBY"; an open-ended period shows only its start. */
export function formatSpan(period: Period, cal: Calendar): string {
  if (period.start === null) return '';
  const from = formatYear(period.start, cal);
  if (period.end === null || period.end === period.start) return from;
  return `${from}–${formatYear(period.end, cal)}`;
}

export function primaryOf(periods: Period[]): Period | undefined {
  return periods.find(period => period.primary);
}

/**
 * Groups works by the start of their primary period, ascending; works that share
 * a start share a group (a tie, not an order). A work with no primary start goes
 * to `undated` and is never dropped.
 */
export function axisGroups<T extends { id: string; periods: Period[] }>(
  works: T[],
): { groups: { start: number; ids: string[] }[]; undated: string[] } {
  const byStart = new Map<number, string[]>();
  const undated: string[] = [];
  for (const work of works) {
    const start = primaryOf(work.periods)?.start;
    if (start === null || start === undefined) {
      undated.push(work.id);
      continue;
    }
    byStart.set(start, [...(byStart.get(start) ?? []), work.id]);
  }
  const groups = [...byStart.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, ids]) => ({ start, ids }));
  return { groups, undated };
}

/** Vertical gap in pixels between two axis rows `delta` years apart. */
export function gapFor(delta: number, scale: 'equal' | 'proportional'): number {
  if (scale === 'equal') return 30;
  return Math.min(340, Math.max(24, delta * 16));
}

/**
 * Pairs of consecutive *dated* works in `listOrder` whose starts decrease, i.e.
 * the list puts `earlier` before `later` but the dates say the opposite. Undated
 * works are skipped; equal starts are a tie, not a conflict.
 */
export function orderConflicts(
  listOrder: string[],
  startById: Map<string, number>,
): { earlier: string; later: string }[] {
  const conflicts: { earlier: string; later: string }[] = [];
  let previous: string | undefined;
  for (const id of listOrder) {
    const start = startById.get(id);
    if (start === undefined) continue;
    if (previous !== undefined && (startById.get(previous) as number) > start) {
      conflicts.push({ earlier: previous, later: id });
    }
    previous = id;
  }
  return conflicts;
}
