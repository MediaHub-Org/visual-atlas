#!/usr/bin/env node
// Local cover backfill for works that AniList, Comic Vine and TMDB could not match (a comic or manga
// the exact-title match skipped, an announced series). The cover is the lead image of the work's
// English Wikipedia article, found by a page title written below by hand, so nothing is matched by
// guesswork. Like every other cover it is a local cache: ignored by Git, stripped from builds, with
// the provenance sidecar and an expiry date. Covers on Wikipedia are non-free images used on the
// article about the work; this cache is for local research only and is never redistributed.
//
//   node scripts/fetch-wikipedia-covers.mjs --dry-run
//   node scripts/fetch-wikipedia-covers.mjs
//   node scripts/fetch-wikipedia-covers.mjs --only text--maus
import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {imageType} from './text-sources.mjs';
import {tmdbExpiry} from './tmdb-cache.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const USER_AGENT = 'visual-atlas-pilot/0.1 (local research tool)';
const DELAY_MS = 3000;

/** work id -> Wikipedia article (English, or `es:` for Spanish) whose lead image is the work's cover; a logo is not a cover, so a page whose lead image is a logo is not listed. */
export const PAGES = {
  'text--pokemon-adventures-manga': 'Pokémon Adventures',
  'text--vagabond-manga': 'Vagabond (manga)',
  'text--maus': 'Maus',
  'text--jojo-manga': "JoJo's Bizarre Adventure",
  'text--hellboy-comic': 'Hellboy',
  'text--asterix-comic': 'Asterix the Gaul',
  'text--mortadelo-y-filemon-comic': 'es:Mortadelo y Filemón',
  'text--lucky-luke-comic': 'Lucky Luke',
  'text--my-hero-academia-manga': 'My Hero Academia',
  'text--sin-city-comic': 'Sin City',
  'text--the-boys-comic': 'The Boys (comics)',
  'text--scott-pilgrim-comic': 'Scott Pilgrim',
  'text--bone-comic': 'Bone (comics)',
  'text--persepolis': 'Persepolis (comics)',
  'film--casino-royale-climax--1954': 'Casino Royale (Climax!)',
};

const root = process.cwd();
const dir = join(root, 'public', 'posters');
await mkdir(dir, {recursive: true});
const have = new Set((await readdir(dir)).filter(file => /\.(jpg|png|webp)$/.test(file)).map(file => file.replace(/\.(jpg|png|webp)$/, '')));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let saved = 0, skipped = 0;
for (const [workId, page] of Object.entries(PAGES)) {
  if (only && workId !== only) continue;
  if (have.has(workId)) continue;
  try {
    const lang = page.startsWith('es:') ? 'es' : 'en';
    const title = page.replace(/^es:/, '');
    const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    const response = await fetch(summaryUrl, {headers: {'User-Agent': USER_AGENT, Accept: 'application/json'}, signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(`Wikipedia ${response.status}`);
    const summary = await response.json();
    const source = summary.originalimage?.source ?? summary.thumbnail?.source;
    if (!source || !/^https:\/\//.test(source)) throw new Error('the article has no lead image');
    // A thumbnail is plenty for a card and keeps the file small.
    const imageUrl = summary.thumbnail?.source ?? source;
    // Wikimedia throttles quick successive downloads: wait and retry politely.
    let image = await fetch(imageUrl, {headers: {'User-Agent': USER_AGENT}, signal: AbortSignal.timeout(20000)});
    for (let retry = 0; retry < 3 && image.status === 429; retry += 1) {
      await sleep(15000);
      image = await fetch(imageUrl, {headers: {'User-Agent': USER_AGENT}, signal: AbortSignal.timeout(20000)});
    }
    if (!image.ok) throw new Error(`image ${image.status}`);
    const bytes = new Uint8Array(await image.arrayBuffer());
    const ext = imageType(image.headers.get('content-type'), bytes);
    if (!ext) throw new Error('the lead image is not a JPEG, PNG or WebP');
    if (bytes.length > 5_000_000) throw new Error('image too large');
    if (dryRun) { console.log(`${workId} <- "${summary.title}" (${ext}, ${Math.round(bytes.length / 1024)} kB, dry run)`); await sleep(DELAY_MS); continue; }
    const target = join(dir, `${workId}.${ext}`);
    await writeFile(target, bytes);
    const cachedAt = new Date();
    await writeFile(`${target}.json`, JSON.stringify({
      source: 'Wikipedia lead image',
      page: summary.title,
      pageUrl: summary.content_urls?.desktop?.page ?? null,
      imageUrl,
      cachedAt: cachedAt.toISOString(),
      expires: tmdbExpiry(cachedAt),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }, null, 2));
    saved += 1;
    console.log(`${workId} <- "${summary.title}" (${ext}, ${Math.round(bytes.length / 1024)} kB)`);
  } catch (error) {
    skipped += 1;
    console.log(`${workId}: ${error.message} — skipped`);
  }
  await sleep(DELAY_MS);
}
console.log(`\nSaved ${saved} · skipped ${skipped}${dryRun ? ' (dry run)' : ''}`);
