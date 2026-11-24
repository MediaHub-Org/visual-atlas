// Strict parsing of Wookieepedia's infobox timeline fields (canon only).
// Nothing here guesses: a string without an era year parses to no period at all.

const REF = /<ref\b[^>]*\/>|<ref\b[^>]*>[\s\S]*?<\/ref>/gi;
const ERA = /(\d+)\s*(BBY|ABY)/gi;

/**
 * The canon timeline field of a page's infobox: `canon_timeline`, else
 * `timeline`. `legends_timeline` is never read. Returns null when neither exists.
 */
export function extractTimeline(wikitext) {
  for (const field of ['canon_timeline', 'timeline']) {
    const match = new RegExp(`^\\|\\s*${field}\\s*=([\\s\\S]*?)(?=^\\|[a-z_ ]+=|^\\}\\})`, 'm').exec(wikitext);
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

function parseEntry(entry) {
  const labelled = /\{\{C\|([^}]*)\}\}/.exec(entry);
  const label = labelled ? plain(labelled[1]).trim() : null;
  const body = plain(entry.replace(/\{\{C\|[^}]*\}\}/g, ''));
  const years = [...body.matchAll(ERA)].map((hit) => eraValue(`${hit[1]} ${hit[2]}`));
  if (years.length === 0) return null;
  let qualifier = 'exact';
  if (/during or after/i.test(body)) qualifier = 'open_after';
  else if (/days before/i.test(body)) qualifier = 'days_before';
  else if (/(^|\s)c\.\s/i.test(body)) qualifier = 'circa';
  const start = years[0];
  const end = qualifier === 'open_after' ? null : years.length > 1 ? years[1] : years[0];
  return { label, start, end, qualifier, primary: false };
}

/**
 * Timeline string -> periods. Exactly one period is primary: the one labelled
 * "Main story", else the first. `parsed` is false (and periods empty) when the
 * string holds no era year.
 */
export function parseTimeline(raw) {
  const entries = String(raw ?? '')
    .split(/\n/)
    .map((line) => line.replace(/^\s*\*\s*/, '').trim())
    .filter(Boolean);
  const periods = entries.map(parseEntry).filter(Boolean);
  if (periods.length === 0) return { periods: [], parsed: false };
  const main = periods.findIndex((period) => period.label?.toLowerCase() === 'main story');
  periods[main >= 0 ? main : 0].primary = true;
  return { periods, parsed: true };
}
