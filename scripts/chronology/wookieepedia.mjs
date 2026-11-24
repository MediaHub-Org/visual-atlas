// Strict parsing of Wookieepedia's infobox timeline fields (canon only).
// Nothing here guesses: a string without an era year parses to no period at all.

const REF = /<ref\b[^>]*\/>|<ref\b[^>]*>[\s\S]*?<\/ref>/gi;
const SPAN = /^(\d+\s*(?:BBY|ABY))(?:\s*(?:&ndash;|–|-)\s*(\d+\s*(?:BBY|ABY)))?$/i;

/**
 * The canon timeline field of a page's infobox: `canon_timeline`, else
 * `timeline`. `legends_timeline` is never read. Returns null when neither exists.
 */
export function extractTimeline(wikitext) {
  for (const field of ['canon_timeline', 'timeline']) {
    const match = new RegExp(`^\\|\\s*${field}\\s*=([\\s\\S]*?)(?=^\\|[^=\\n]+=|^\\}\\})`, 'm').exec(wikitext);
    if (match) return { field, raw: match[1].replace(REF, '').trim() };
  }
  return null;
}

/** "32 BBY" -> -32, "9 ABY" -> 9, "0 ABY" -> 0; anything else -> null. */
export function eraValue(text) {
  const match = /^\s*(\d+)\s*(BBY|ABY)\s*$/i.exec(text);
  if (!match) return null;
  const years = Number(match[1]);
  return match[2].toUpperCase() === 'BBY' ? (years === 0 ? 0 : -years) : years;
}

/** [[a|b]] -> b, [[a]] -> a, {{C|x}} kept for the label step. */
function plain(text) {
  return text.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2');
}

/**
 * One timeline entry -> a period, or null when its wording is not one of the
 * accepted shapes: `Y`, `Y-Y` (hyphen or en dash, never ending before it starts),
 * optionally prefixed `c.` or `During or after`, or followed by `, days before ...`.
 * Anything else (a thousands separator, "shortly after", a third year) is refused
 * rather than read as an exact date.
 */
function parseEntry(entry) {
  const labelled = /\{\{C\|([^}]*)\}\}/.exec(entry);
  const label = (labelled ? plain(labelled[1]).trim() : '') || null;
  let body = plain(entry.replace(/\{\{C\|[^}]*\}\}/g, '')).trim();
  let qualifier = 'exact';
  const days = /^(.*?),?\s*days before/is.exec(body);
  if (days) {
    qualifier = 'days_before';
    body = days[1].trim();
  } else if (/^during or after\s+/i.test(body)) {
    qualifier = 'open_after';
    body = body.replace(/^during or after\s+/i, '');
  } else if (/^c\.\s*/i.test(body)) {
    qualifier = 'circa';
    body = body.replace(/^c\.\s*/i, '');
  }
  const span = SPAN.exec(body);
  if (!span) return null;
  const start = eraValue(span[1]);
  const end = span[2] === undefined ? start : eraValue(span[2]);
  if (end < start || (qualifier === 'open_after' && span[2] !== undefined)) return null;
  return { label, start, end: qualifier === 'open_after' ? null : end, qualifier, primary: false };
}

/**
 * Timeline string -> periods. Exactly one period is primary: the one labelled
 * "Main story", else the first. `parsed` is false (and periods empty) when the
 * string holds no era year or any entry is not an accepted shape.
 */
export function parseTimeline(raw) {
  const entries = String(raw ?? '')
    .split(/\n/)
    .map((line) => line.replace(/^\s*\*\s*/, '').trim())
    .filter(Boolean);
  const periods = entries.map(parseEntry);
  // One unreadable entry refuses the whole field: nothing is kept half-understood.
  if (periods.length === 0 || periods.some((period) => period === null)) return { periods: [], parsed: false };
  const main = periods.findIndex((period) => period.label?.toLowerCase() === 'main story');
  periods[main >= 0 ? main : 0].primary = true;
  return { periods, parsed: true };
}
