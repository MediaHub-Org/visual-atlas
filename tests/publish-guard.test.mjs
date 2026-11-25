import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { forbiddenFiles, missingFiles } from '../scripts/publish-guard.mjs';

describe('publish guard: nothing that may not be redistributed goes into the public site', () => {
  it('refuses posters, covers and their sidecars, in any folder', () => {
    const bad = forbiddenFiles(['posters/film--a.jpg', 'posters/manifest.json', 'x/posters/text--b.png', 'assets/index.js', 'index.html']);
    assert.deepEqual(bad, ['posters/film--a.jpg', 'posters/manifest.json', 'x/posters/text--b.png']);
  });
  it('refuses the local TMDB, AniList and Comic Vine caches', () => {
    const bad = forbiddenFiles(['data/tmdb_metadata.json', 'data/tmdb_credits.json', 'data/text_metadata.json', 'data/text_adaptation_proposals.json', 'data/media_atlas_seed.json']);
    assert.deepEqual(bad, ['data/tmdb_metadata.json', 'data/tmdb_credits.json', 'data/text_metadata.json', 'data/text_adaptation_proposals.json']);
  });
  it('refuses secrets, local databases and dependencies', () => {
    const bad = forbiddenFiles(['.env', '.env.local', 'db/.data/base/1', 'node_modules/react/index.js', 'poster.jpg.json']);
    assert.equal(bad.length, 5);
  });
  it('lets the curated data and the attribution logo through', () => {
    assert.deepEqual(forbiddenFiles(['data/media_text_seed.json', 'data/universe_families.json', 'data/chronology/star-wars.json', 'tmdb-logo.svg', 'favicon.svg', 'assets/index-abc.css']), []);
  });
  it('reports what a publishable site must have', () => {
    assert.deepEqual(missingFiles(['index.html', '.nojekyll', 'data/media_atlas_seed.json', 'data/media_text_seed.json', 'data/universe_families.json']), []);
    assert.deepEqual(missingFiles(['index.html']), ['.nojekyll', 'data/media_atlas_seed.json', 'data/media_text_seed.json', 'data/universe_families.json']);
  });
});
