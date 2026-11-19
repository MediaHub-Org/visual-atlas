// Shared, conservative matching for the local TMDB scripts. A candidate is only
// accepted on an exact normalised title, or on the seed title contained as a
// whole phrase; a rule can add an explicit year or prefer the earliest/latest
// dated edition, and a tie is refused rather than guessed.
export const normalise = text => (text ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/^the\s+/, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export const dateOf = result => result.release_date ?? result.first_air_date ?? '';

export function chooseMatches(candidates, query, rule = {}) {
  const target = normalise(query);
  const exact = candidates.filter(result => normalise(result.title ?? result.name) === target);
  // A rule names a specific edition, so a loose phrase match would defeat it:
  // "Daredevil" must not resolve to "Super Dave: Daredevil for Hire".
  // A preferred edition is only safe on an exact title; an explicit year can
  // still use a contained title because the year rules out the wrong edition.
  let pool = exact;
  if (!pool.length && !rule.prefer) {
    pool = candidates.filter(result => {
      const other = normalise(result.title ?? result.name);
      return ` ${other} `.includes(` ${target} `);
    });
  }
  if (rule.year) pool = pool.filter(result => dateOf(result).slice(0, 4) === String(rule.year));
  // An undated entry would otherwise sort as "earliest" and win by accident.
  if (rule.prefer) pool = pool.filter(result => dateOf(result) !== '');
  if (rule.prefer && pool.length > 1) {
    const sorted = [...pool].sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || a.id - b.id);
    const chosen = rule.prefer === 'earliest' ? sorted[0] : sorted[sorted.length - 1];
    const sameDate = sorted.filter(result => dateOf(result) === dateOf(chosen));
    return sameDate.length > 1 ? [] : [chosen];
  }
  // Duplicate catalogue entries share a title and year; the popular one is the
  // real record, but only when the difference is unambiguous.
  if (pool.length > 1 && !rule.prefer) {
    const byPopularity = [...pool].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    if ((byPopularity[0].popularity ?? 0) > (byPopularity[1].popularity ?? 0)) return [byPopularity[0]];
  }
  return pool;
}

/** Exact title only, within a small year window (festival vs. wide release). */
export function relaxedMatches(candidates, query, year, window = 2) {
  const target = normalise(query);
  const pool = candidates.filter(result => {
    const date = dateOf(result);
    if (!date) return false;
    const difference = Math.abs(Number(date.slice(0, 4)) - year);
    return normalise(result.title ?? result.name) === target && difference <= window;
  });
  if (pool.length === 1) return pool;
  const byPopularity = [...pool].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  if (pool.length > 1 && (byPopularity[0].popularity ?? 0) > (byPopularity[1].popularity ?? 0)) return [byPopularity[0]];
  return [];
}
