#!/usr/bin/env node
// Fills only the release years the seed leaves empty, from TMDB. Everything it
// writes is imported metadata: the app shows it with a marker and the seed's
// curated fields are never touched. Resumable; ambiguous titles are skipped.
//
//   node --env-file-if-exists=.env scripts/fetch-metadata.mjs
//   node --env-file-if-exists=.env scripts/fetch-metadata.mjs --limit 10
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const limit = Number(value('limit') ?? 1000);
const delayMs = 260;

const key = process.env.TMDB_API_KEY?.trim();
if (!key) {
  console.error('TMDB_API_KEY is not set. Put it in .env (ignored by Git) and rerun.');
  process.exit(1);
}
const bearer = key.startsWith('eyJ');
const root = process.cwd();
const seed = JSON.parse(await readFile(join(root, 'public', 'data', 'media_atlas_seed.json'), 'utf8'));
const posterDir = join(root, 'public', 'posters');
const outPath = join(root, 'public', 'data', 'tmdb_metadata.json');

const output = JSON.parse(await readFile(outPath, 'utf8').catch(() => '{"entries":{}}'));
output.source = 'TMDB';
output.note = 'Imported release metadata. Not independently verified; it never overwrites curated seed fields.';

const normalise = text => (text ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/^the\s+/, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

async function api(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [name, entry] of Object.entries(params)) if (entry !== undefined && entry !== '') url.searchParams.set(name, entry);
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

let filled = 0, skipped = 0;

for (const work of seed.works) {
  if (work.release_year) continue;
  if (output.entries[work.id]?.year) continue;
  if (filled + skipped >= limit) break;

  // A saved poster already carries TMDB's primary release date.
  let sidecar = null;
  try {
    sidecar = JSON.parse(await readFile(join(posterDir, `${work.id}.jpg.json`), 'utf8'));
  } catch {}
  const sidecarDate = sidecar?.releaseDate;
  if (sidecarDate && /^\d{4}-\d{2}-\d{2}$/.test(sidecarDate)) {
    output.entries[work.id] = {
      tmdbId: sidecar.tmdbId ?? null,
      title: sidecar.matchedTitle ?? work.title,
      date: sidecarDate,
      year: Number(sidecarDate.slice(0, 4)),
      origin: 'poster-cache',
      match: 'exact',
      importedAt: new Date().toISOString(),
    };
    filled += 1;
    console.log(`${work.title} -> ${sidecarDate} (poster cache)`);
    if (filled % 20 === 0) await persist();
    continue;
  }

  const kind = work.format === 'film' ? 'movie' : 'tv';
  let body;
  try {
    body = await api(`/search/${kind}`, {query: work.title});
  } catch (error) {
    console.error(`${work.title}: ${error.message}`);
    skipped += 1;
    continue;
  }
  const target = normalise(work.title);
  const candidates = (body.results ?? []).filter(result => (result.release_date ?? result.first_air_date ?? '') !== '');
  const exact = candidates.filter(result => normalise(result.title ?? result.name) === target);
  const contained = candidates.filter(result => {
    const other = normalise(result.title ?? result.name);
    return ` ${other} `.includes(` ${target} `);
  });
  const matches = exact.length ? exact : contained;

  if (matches.length !== 1) {
    output.entries[work.id] = {status: matches.length ? 'ambiguous' : 'unmatched', title: work.title, checkedAt: new Date().toISOString()};
    skipped += 1;
    console.log(`${work.title}: ${matches.length ? 'ambiguous' : 'no match'} — skipped`);
    await new Promise(r => setTimeout(r, delayMs));
    continue;
  }

  const match = matches[0];
  const date = match.release_date ?? match.first_air_date;
  output.entries[work.id] = {
    tmdbId: match.id,
    title: match.title ?? match.name,
    date,
    year: Number(String(date).slice(0, 4)),
    origin: 'search',
    match: exact.length ? 'exact' : 'contained',
    importedAt: new Date().toISOString(),
  };
  filled += 1;
  console.log(`${work.title} -> ${date} (${match.title ?? match.name})`);
  if (filled % 20 === 0) await persist();
  await new Promise(r => setTimeout(r, delayMs));
}

await persist();
console.log(`\nFilled ${filled} · skipped ${skipped}`);
console.log(`Metadata: ${outPath}`);
