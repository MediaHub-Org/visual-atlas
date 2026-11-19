#!/usr/bin/env node
// Local poster backfill for the unverified seed. Deliberately conservative:
// a work is only matched when the normalised title equals a TMDB result and the
// year agrees, so nothing is attributed by guesswork. Every download keeps the
// same 150-day provenance sidecar as the in-app saver.
//
// Usage:
//   npm run posters:fetch -- --dry-run --limit 20
//   npm run posters:fetch -- --limit 100
//   npm run posters:fetch -- --franchise "Star Wars" --force
//
// Requires TMDB_API_KEY in .env (or the environment). Do not commit the key.
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chooseMatches, dateOf, normalise, relaxedMatches} from './match.mjs';
import {titleRules} from './title-rules.mjs';

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const value = name => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const dryRun = flag('dry-run');
const force = flag('force');
const deep = flag('deep');
const limit = Number(value('limit') ?? 100);
const franchiseFilter = value('franchise');
const delayMs = Number(value('delay') ?? 260);

const key = process.env.TMDB_API_KEY?.trim();
if (!key) {
  console.error('TMDB_API_KEY is not set. Put it in .env (ignored by Git) and rerun.');
  process.exit(1);
}
const bearer = key.startsWith('eyJ');

const root = process.cwd();
const seed = JSON.parse(await readFile(join(root, 'public', 'data', 'media_atlas_seed.json'), 'utf8'));
const posterDir = join(root, 'public', 'posters');
const manifestPath = join(posterDir, 'manifest.json');
await mkdir(posterDir, {recursive: true});

const memberships = new Map();
for (const membership of seed.memberships) {
  const list = memberships.get(membership.work_id) ?? [];
  list.push(membership.franchise_id);
  memberships.set(membership.work_id, list);
}
const franchiseNames = new Map(seed.franchises.map(f => [f.id, f.name]));

let works = seed.works;
if (franchiseFilter) {
  const franchiseId = seed.franchises.find(f => f.name === franchiseFilter)?.id;
  if (!franchiseId) {
    console.error(`Unknown franchise: ${franchiseFilter}`);
    process.exit(1);
  }
  works = works.filter(work => (memberships.get(work.id) ?? []).includes(franchiseId));
}

async function api(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [name, entry] of Object.entries(params)) if (entry !== undefined && entry !== '') url.searchParams.set(name, entry);
  if (!bearer) url.searchParams.set('api_key', key);
  const response = await fetch(url, {
    headers: bearer ? {Authorization: `Bearer ${key}`} : {},
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 429) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return api(path, params);
  }
  if (!response.ok) throw new Error(`TMDB ${response.status} for ${path}`);
  return response.json();
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{"entries":{}}'));
let saved = 0, skipped = 0, missing = 0;

async function persistManifest() {
  manifest.generatedAt = new Date().toISOString();
  manifest.note = 'Posters cached from TMDB for at most 150 days. Recheck attribution and terms before distribution.';
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

for (const work of works.slice(0, limit)) {
  const entry = manifest.entries[work.id];
  // The file is the source of truth: a manifest entry can outlive a deleted
  // poster (expired cache, manual removal) and must not block a retry.
  const existing = await readFile(join(posterDir, `${work.id}.jpg`)).catch(() => null);
  if (existing && !force) continue;

  const kind = work.format === 'film' ? 'movie' : 'tv';
  const rule = titleRules[work.id];
  const query = rule?.query ?? work.title;
  const expectedYear = work.release_year ?? rule?.year;
  const params = {query};
  if (expectedYear) {
    if (kind === 'movie') params.year = expectedYear; else params.first_air_date_year = expectedYear;
  }
  let body;
  try {
    body = await api(`/search/${kind}`, params);
  } catch (error) {
    entry && (manifest.entries[work.id] = {status: 'error', message: String(error)});
    console.error(`${work.title}: ${error.message}`);
    missing += 1;
    await new Promise(resolve => setTimeout(resolve, delayMs));
    continue;
  }

  const target = normalise(query);
  const yearMatches = result => {
    if (!expectedYear) return true;
    return dateOf(result).slice(0, 4) === String(expectedYear);
  };
  // Events and tie-ins reuse a film's title; they are not the film.
  const eventTitle = /\b(premiere|making of|behind the scenes|documentary|concert|fan event|re-release)\b/i;
  const candidates = (body.results ?? []).filter(result => result.poster_path && !eventTitle.test(normalise(result.title ?? result.name)));
  let matches = chooseMatches(candidates.filter(yearMatches), query, rule);

  // Festival and wide releases differ by a year or two in TMDB. Only an exact
  // title is allowed here, so a sequel or remake cannot slip in.
  if (!matches.length && work.release_year && !rule) {
    matches = relaxedMatches(candidates, query, work.release_year);
  }

  // Deep pass: TMDB stores some films under a different title ("A New Hope" is
  // "Star Wars"). Only an exact alternative title with the exact year is
  // accepted, so nothing is matched by resemblance.
  if (!matches.length && deep) {
    const loose = await api(`/search/${kind}`, {query});
    const looseCandidates = (loose.results ?? []).filter(result => result.poster_path && yearMatches(result)).slice(0, 8);
    for (const candidate of looseCandidates) {
      const alternatives = await api(`/${kind}/${candidate.id}/alternative_titles`).catch(() => null);
      const titles = (alternatives?.titles ?? alternatives?.results ?? []).map(entry => entry.title ?? '');
      const targetPhrase = ` ${target} `;
      if (titles.some(title => { const other = normalise(title); return other === target || ` ${other} `.includes(targetPhrase); })) matches.push(candidate);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  if (matches.length !== 1) {
    manifest.entries[work.id] = {
      status: matches.length ? 'ambiguous' : 'unmatched',
      title: work.title,
      year: work.release_year,
      candidates: candidates.slice(0, 5).map(result => ({
        id: result.id,
        title: result.title ?? result.name,
        date: result.release_date ?? result.first_air_date ?? null,
      })),
    };
    skipped += 1;
    console.log(`${work.title}: ${matches.length ? 'ambiguous' : 'no exact match'} — skipped`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
    continue;
  }

  const match = matches[0];
  if (dryRun) {
    console.log(`${work.title} (${work.release_year}) -> TMDB #${match.id} ${match.title ?? match.name}`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
    continue;
  }

  try {
    const image = await fetch(`https://image.tmdb.org/t/p/w500${match.poster_path}`, {signal: AbortSignal.timeout(20000)});
    if (!image.ok || !image.headers.get('content-type')?.startsWith('image/jpeg')) throw new Error('poster is not a JPEG');
    const bytes = new Uint8Array(await image.arrayBuffer());
    if (bytes.length > 5_000_000) throw new Error('poster too large');
    await writeFile(join(posterDir, `${work.id}.jpg`), bytes);
    const cachedAt = new Date();
    const expires = new Date(cachedAt.getTime() + 150 * 24 * 60 * 60 * 1000);
    await writeFile(join(posterDir, `${work.id}.jpg.json`), JSON.stringify({
      source: 'TMDB',
      poster: match.poster_path,
      tmdbId: match.id,
      matchedTitle: match.title ?? match.name,
      releaseDate: match.release_date ?? match.first_air_date ?? null,
      cachedAt: cachedAt.toISOString(),
      expires: expires.toISOString(),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }, null, 2));
    manifest.entries[work.id] = {status: 'saved', tmdbId: match.id, poster: match.poster_path};
    saved += 1;
    console.log(`${work.title} -> saved (TMDB #${match.id})`);
  } catch (error) {
    manifest.entries[work.id] = {status: 'error', message: String(error)};
    missing += 1;
    console.error(`${work.title}: ${error.message}`);
  }
  await new Promise(resolve => setTimeout(resolve, delayMs));
  // Checkpoint so an interrupted long run does not lose its review notes.
  if ((saved + skipped + missing) % 25 === 0) await persistManifest();
}

await persistManifest();
console.log(`\nSaved ${saved} · skipped ${skipped} · failed ${missing}${dryRun ? ' (dry run)' : ''}`);
console.log(`Manifest: ${manifestPath}`);
