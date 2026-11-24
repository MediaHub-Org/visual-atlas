#!/usr/bin/env node
// Fetches the in-world dates of the mapped works from Wookieepedia (public
// MediaWiki API, one request per page) and writes the committed data file
// public/data/chronology/star-wars.json. Wookieepedia text is CC BY-SA 3.0:
// every entry keeps page, URL, revision, retrieval date and the raw infobox string.
//
//   node scripts/fetch-wookieepedia-dates.mjs
//
// A page whose timeline cannot be parsed is kept with its raw string and no
// periods; a page that cannot be fetched keeps its previous entry. Nothing is guessed.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { calendar, pages } from './chronology/star-wars-pages.mjs';
import { extractTimeline, parseTimeline } from './chronology/wookieepedia.mjs';

const API = 'https://starwars.fandom.com/api.php';
const USER_AGENT = 'visual-atlas-pilot/0.1 (local research tool)';
const DELAY_MS = 300;

export function buildEntry(workId, pageTitle, apiPage, revid, now = new Date()) {
  const wikitext = apiPage?.revisions?.[0]?.slots?.main?.['*'];
  if (typeof wikitext !== 'string') return { error: `${workId}: page "${pageTitle}" has no content` };
  const found = extractTimeline(wikitext);
  if (!found) return { error: `${workId}: page "${pageTitle}" has no canon timeline field` };
  const { periods, parsed } = parseTimeline(found.raw);
  const title = apiPage.title ?? pageTitle;
  return {
    page: title,
    url: `https://starwars.fandom.com/wiki/${encodeURI(title.replace(/ /g, '_'))}`,
    revision: revid ?? null,
    retrievedAt: now.toISOString(),
    field: found.field,
    raw: found.raw,
    parsed,
    periods,
  };
}

async function fetchPage(title) {
  const params = new URLSearchParams({
    action: 'query', prop: 'revisions', rvprop: 'ids|content', rvslots: 'main',
    redirects: '1', format: 'json', titles: title,
  });
  const response = await fetch(`${API}?${params}`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Wookieepedia ${response.status} for "${title}"`);
  const body = await response.json();
  const page = Object.values(body.query?.pages ?? {})[0];
  return { page, revid: page?.revisions?.[0]?.revid ?? null };
}

async function main() {
  const root = process.cwd();
  const outPath = join(root, 'public', 'data', 'chronology', 'star-wars.json');
  const previous = JSON.parse(await readFile(outPath, 'utf8').catch(() => '{"entries":{}}'));
  const entries = { ...previous.entries };
  let filled = 0, unparsed = 0, failed = 0;

  for (const [workId, title] of Object.entries(pages)) {
    try {
      const { page, revid } = await fetchPage(title);
      const entry = buildEntry(workId, title, page, revid);
      if (entry.error) { console.error(entry.error); failed += 1; continue; }
      entries[workId] = entry;
      if (entry.parsed) filled += 1; else { unparsed += 1; console.error(`${workId}: could not parse "${entry.raw}"`); }
    } catch (error) {
      console.error(`${workId}: ${error.message}`);
      failed += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  const output = {
    source: {
      name: 'Wookieepedia',
      licence: 'CC BY-SA 3.0',
      licence_url: 'https://creativecommons.org/licenses/by-sa/3.0/',
      note: 'Canon in-world dates as stated by Wookieepedia (a fan wiki); not independently verified.',
    },
    calendar,
    generatedAt: new Date().toISOString(),
    entries,
  };
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`Filled ${filled} · unparsed ${unparsed} · failed ${failed}`);
  console.log(`Data: ${outPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
