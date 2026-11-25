#!/usr/bin/env node
// Local enrichment of the text-media catalogue: first-publication year, creators and
// a cover, from AniList (manga) and Comic Vine (western comics). Like the TMDB data it
// is local-only (ignored by Git, stripped from builds) and every entry carries an
// `expires` date. Nothing is matched by guesswork: a work is cached only when a source
// returns exactly one candidate whose normalised title equals the seed's title.
//
// AniList's relations that mention adaptations are written to a separate proposals
// file for the owner to review; they never enter the seed by themselves.
//
// Usage (call node directly: npm swallows flags after `npm run … --`):
//   node --env-file-if-exists=.env scripts/fetch-text-metadata.mjs --dry-run
//   node --env-file-if-exists=.env scripts/fetch-text-metadata.mjs --only text--maus
// COMICVINE_API_KEY (env or .env) enables the western comics; AniList needs no key.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalise } from './match.mjs';
import { adaptationProposals, chooseTitle, imageType, parseAniListMedia, parseComicVineSearch } from './text-sources.mjs';
import { tmdbExpiry } from './tmdb-cache.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const dryRun = flag('dry-run');
const only = value('only');
const limit = Number(value('limit') ?? 200);
const ANILIST_DELAY = 700;
const COMICVINE_DELAY = 1100;
const USER_AGENT = 'visual-atlas-pilot/0.1 (local research tool)';
const comicVineKey = process.env.COMICVINE_API_KEY?.trim();

const root = process.cwd();
const seedPath = join(root, 'public', 'data', 'media_text_seed.json');
const cachePath = join(root, 'public', 'data', 'text_metadata.json');
const proposalsPath = join(root, 'public', 'data', 'text_adaptation_proposals.json');
const posterDir = join(root, 'public', 'posters');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const seed = JSON.parse(await readFile(seedPath, 'utf8'));
const cache = JSON.parse(await readFile(cachePath, 'utf8').catch(() => '{"entries":{}}'));
cache.note = 'Imported from AniList and Comic Vine for local use only. Not independently verified; it never overwrites curated seed fields.';
const proposals = JSON.parse(await readFile(proposalsPath, 'utf8').catch(() => '{"proposals":[]}'));

const ANILIST_QUERY = `query ($id: Int, $search: String) {
  Media(id: $id, search: $search, type: MANGA) {
    id title { romaji english native } startDate { year } status coverImage { large }
    staff(perPage: 6) { edges { role node { name { full } } } }
    relations { edges { relationType node { id type format title { romaji english } } } }
  }
}`;

async function aniList(work) {
  const id = work.external_ids?.anilist;
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ query: ANILIST_QUERY, variables: id ? { id: Number(id) } : { search: work.title } }),
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`AniList ${response.status}`);
  const media = parseAniListMedia(await response.json());
  if (!media) return null;
  // A fuzzy search can return a different series: require an exact title on one variant.
  if (!id && !media.titles.some((title) => normalise(title) === normalise(work.title))) return null;
  return { source: 'anilist', sourceId: media.id, title: media.titles[0] ?? work.title, year: media.year, creators: media.creators, coverUrl: media.coverUrl, media };
}

// US original publishers (a year from any other publisher is a reprint's, so it is not kept). Comic Vine lists every foreign reprint as its own volume.
// Publishers of the original editions: Comic Vine lists every foreign reprint as its own volume.
const ORIGINAL_PUBLISHERS = ['Marvel', 'DC Comics', 'Image', 'Dark Horse Comics', 'Fantagraphics', 'Top Shelf', 'Top Shelf Productions', 'Vertigo'];

async function comicVine(work) {
  const url = new URL('https://comicvine.gamespot.com/api/search/');
  url.search = new URLSearchParams({ api_key: comicVineKey, format: 'json', resources: 'volume', query: work.title, limit: '20', field_list: 'id,name,start_year,publisher,image,count_of_issues' });
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Comic Vine ${response.status}`);
  const row = chooseTitle(parseComicVineSearch(await response.json()), work.title, work.release_year ?? null, ORIGINAL_PUBLISHERS);
  if (!row) return null;
  return { source: 'comicvine', sourceId: row.id, title: row.title, year: ORIGINAL_PUBLISHERS.includes(row.publisher) ? row.year : null, creators: [], coverUrl: row.coverUrl, publisher: row.publisher, media: null };
}

async function saveCover(work, coverUrl) {
  const image = await fetch(coverUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20000) });
  if (!image.ok) throw new Error(`cover request failed (${image.status})`);
  const bytes = new Uint8Array(await image.arrayBuffer());
  const ext = imageType(image.headers.get('content-type'), bytes);
  if (!ext) throw new Error('cover is not a JPEG, PNG or WebP image');
  if (bytes.length > 5_000_000) throw new Error('cover too large');
  await mkdir(posterDir, { recursive: true });
  const cachedAt = new Date();
  // One cover per work: drop a previous copy in another format.
  for (const other of ['jpg', 'png', 'webp'].filter((entry) => entry !== ext)) {
    await rm(join(posterDir, `${work.id}.${other}`), { force: true });
    await rm(join(posterDir, `${work.id}.${other}.json`), { force: true });
  }
  await writeFile(join(posterDir, `${work.id}.${ext}`), bytes);
  await writeFile(join(posterDir, `${work.id}.${ext}.json`), JSON.stringify({
    source: work.format === 'manga_series' ? 'AniList' : 'Comic Vine',
    cachedAt: cachedAt.toISOString(),
    expires: tmdbExpiry(cachedAt),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }, null, 2));
}

let saved = 0;
let skipped = 0;
for (const work of seed.works ?? []) {
  if (only && work.id !== only) continue;
  if (saved + skipped >= limit) break;
  const cached = cache.entries[work.id];
  if (cached?.expires && Date.parse(cached.expires) > Date.now() && !only) continue;

  const manga = work.format === 'manga_series';
  if (!manga && !comicVineKey) { console.log(`${work.title}: COMICVINE_API_KEY not set, skipped`); skipped += 1; continue; }
  let result = null;
  try {
    result = manga ? await aniList(work) : await comicVine(work);
  } catch (error) {
    console.error(`${work.title}: ${error.message}`);
    skipped += 1;
    await sleep(manga ? ANILIST_DELAY : COMICVINE_DELAY);
    continue;
  }
  if (!result) { console.log(`${work.title}: no exact match, skipped`); skipped += 1; await sleep(manga ? ANILIST_DELAY : COMICVINE_DELAY); continue; }

  console.log(`${work.title} -> ${result.source} #${result.sourceId}, ${result.year ?? 'no year'}, ${result.creators.length} creators${result.coverUrl ? ', cover' : ''}${dryRun ? ' (dry run)' : ''}`);
  if (!dryRun) {
    const { media, coverUrl, ...entry } = result;
    cache.entries[work.id] = { ...entry, coverUrl: coverUrl ?? null, importedAt: new Date().toISOString(), expires: tmdbExpiry() };
    proposals.proposals = proposals.proposals.filter((p) => p.sourceWorkId !== work.id).concat(adaptationProposals(work.id, media));
    if (coverUrl) await saveCover(work, coverUrl).catch((error) => console.error(`${work.title}: ${error.message}`));
  }
  saved += 1;
  await sleep(manga ? ANILIST_DELAY : COMICVINE_DELAY);
}

if (!dryRun) {
  cache.generatedAt = new Date().toISOString();
  proposals.generatedAt = cache.generatedAt;
  proposals.note = 'Adaptation relations reported by a source. Suggestions for the owner: never imported, never certainty above unknown until reviewed.';
  await writeFile(cachePath, JSON.stringify(cache, null, 2));
  await writeFile(proposalsPath, JSON.stringify(proposals, null, 2));
}
console.log(`${dryRun ? 'Dry run: ' : ''}${saved} matched, ${skipped} skipped.`);
