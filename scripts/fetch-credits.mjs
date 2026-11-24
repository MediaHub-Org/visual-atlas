#!/usr/bin/env node
// Imports directors, writers (or a series' creators) and the top-billed cast
// from TMDB into a local cache. Like the posters and the imported years it is
// local-only (ignored by Git, stripped from builds) and every entry carries an
// `expires` date: TMDB's terms allow caching for at most six months.
//
// A work is only looked up when its TMDB id is already known from a saved poster
// or an imported year; nothing is matched here by title, so a credit is never
// attributed by guesswork. The id is stored with the entry so a wrong poster
// match is visible in the app instead of silently spreading to the credits.
//
// Usage (call node directly: npm swallows flags after `npm run … --`):
//   node --env-file-if-exists=.env scripts/fetch-credits.mjs --limit 10
//   node --env-file-if-exists=.env scripts/fetch-credits.mjs
//   node --env-file-if-exists=.env scripts/fetch-credits.mjs --force
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmdbExpiry} from './tmdb-cache.mjs';

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const value = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const limit = Number(value('limit') ?? 2000);
const force = flag('force');
const delayMs = 260;
const CAST = 8;
const WRITER_JOBS = new Set(['Screenplay', 'Writer', 'Story', 'Novel', 'Characters', 'Teleplay']);

const key = process.env.TMDB_API_KEY?.trim();
if (!key) {
  console.error('TMDB_API_KEY is not set. Put it in .env (ignored by Git) and rerun.');
  process.exit(1);
}
const bearer = key.startsWith('eyJ');
const root = process.cwd();
const seed = JSON.parse(await readFile(join(root, 'public', 'data', 'media_atlas_seed.json'), 'utf8'));
const outPath = join(root, 'public', 'data', 'tmdb_credits.json');
const metadata = JSON.parse(await readFile(join(root, 'public', 'data', 'tmdb_metadata.json'), 'utf8').catch(() => '{"entries":{}}'));

const output = JSON.parse(await readFile(outPath, 'utf8').catch(() => '{"entries":{}}'));
output.source = 'TMDB';
output.note = 'Imported credits. Not independently verified; local cache that expires.';

async function api(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [name, entry] of Object.entries(params)) url.searchParams.set(name, entry);
  if (!bearer) url.searchParams.set('api_key', key);
  const response = await fetch(url, {headers: bearer ? {Authorization: `Bearer ${key}`} : {}, signal: AbortSignal.timeout(15000)});
  if (response.status === 429) { await new Promise(r => setTimeout(r, 2000)); return api(path, params); }
  if (!response.ok) throw new Error(`TMDB ${response.status} for ${path}`);
  return response.json();
}

async function persist() {
  output.generatedAt = new Date().toISOString();
  await writeFile(outPath, JSON.stringify(output, null, 2));
}

/** TMDB id of a work from what is already cached locally, or null. */
async function knownTmdbId(workId) {
  const fromMetadata = metadata.entries?.[workId]?.tmdbId;
  if (Number.isInteger(fromMetadata)) return fromMetadata;
  try {
    const sidecar = JSON.parse(await readFile(join(root, 'public', 'posters', `${workId}.jpg.json`), 'utf8'));
    return Number.isInteger(sidecar.tmdbId) ? sidecar.tmdbId : null;
  } catch {
    return null;
  }
}

const person = entry => ({id: entry.id, name: entry.name});
const unique = list => list.filter((entry, index) => list.findIndex(other => other.id === entry.id) === index);

function film(body) {
  const crew = body.credits?.crew ?? [];
  return {
    directors: unique(crew.filter(entry => entry.job === 'Director').map(person)),
    writers: unique(crew.filter(entry => WRITER_JOBS.has(entry.job)).map(entry => ({...person(entry), job: entry.job}))),
    cast: (body.credits?.cast ?? []).slice(0, CAST).map(entry => ({...person(entry), character: entry.character || null})),
  };
}

function series(body) {
  const cast = [...(body.aggregate_credits?.cast ?? [])].sort((a, b) => (b.total_episode_count ?? 0) - (a.total_episode_count ?? 0));
  return {
    directors: [],
    // A series has no single writer: TMDB's "created by" is the closest fact.
    writers: unique((body.created_by ?? []).map(entry => ({...person(entry), job: 'Creator'}))),
    cast: cast.slice(0, CAST).map(entry => ({...person(entry), character: entry.roles?.[0]?.character || null})),
  };
}

let filled = 0, skipped = 0, noId = 0;
for (const work of seed.works) {
  const cached = output.entries[work.id];
  if (!force && cached?.expires && Date.parse(cached.expires) > Date.now()) continue;
  if (filled + skipped >= limit) break;

  const tmdbId = await knownTmdbId(work.id);
  if (tmdbId === null) { noId += 1; continue; }

  const kind = work.format === 'film' ? 'movie' : 'tv';
  let body;
  try {
    body = await api(`/${kind}/${tmdbId}`, {append_to_response: kind === 'movie' ? 'credits' : 'aggregate_credits'});
  } catch (error) {
    console.error(`${work.title}: ${error.message}`);
    skipped += 1;
    continue;
  }
  output.entries[work.id] = {
    tmdbId,
    kind,
    matchedTitle: body.title ?? body.name ?? null,
    ...(kind === 'movie' ? film(body) : series(body)),
    importedAt: new Date().toISOString(),
    expires: tmdbExpiry(),
  };
  filled += 1;
  const entry = output.entries[work.id];
  console.log(`${work.title} -> ${entry.directors.map(p => p.name).join(', ') || entry.writers.map(p => p.name).join(', ') || '—'} · ${entry.cast.length} cast`);
  if (filled % 25 === 0) await persist();
  await new Promise(r => setTimeout(r, delayMs));
}

await persist();
console.log(`\nFilled ${filled} · failed ${skipped} · without a known TMDB id ${noId}`);
console.log(`Credits: ${outPath}`);
