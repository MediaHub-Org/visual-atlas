// The committed text seed (public/data/media_text_seed.json) against the video seed:
// the rules the importer and the app rely on, checked on the real files.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { mergeTextSeed, mediumOfFormat } from '../src/medium.ts';

const read = name => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
const video = read('media_atlas_seed.json');
const text = read('media_text_seed.json');

describe('the committed text seed', () => {
  it('has only text formats and unique ids across both seeds', () => {
    for (const work of text.works) assert.equal(mediumOfFormat(work.format), 'text', work.id);
    const ids = [...video.works, ...text.works].map(work => work.id);
    assert.equal(new Set(ids).size, ids.length);
    const franchises = [...video.franchises, ...text.franchises].map(row => row.id);
    assert.equal(new Set(franchises).size, franchises.length);
  });
  it('gives every text work a franchise that exists, and needs_review status', () => {
    const franchiseIds = new Set([...video.franchises, ...text.franchises].map(row => row.id));
    for (const work of text.works) {
      assert.equal(work.review_status, 'needs_review', work.id);
      const memberships = text.memberships.filter(row => row.work_id === work.id);
      assert.ok(memberships.length > 0, `${work.id} has no franchise`);
      for (const row of memberships) assert.ok(franchiseIds.has(row.franchise_id), `${work.id}: ${row.franchise_id}`);
    }
  });
  it('copies no synopsis, and keeps every adaptation unverified', () => {
    for (const work of text.works) assert.ok(!work.synopsis, `${work.id} carries a synopsis`);
    for (const link of text.adaptations) assert.ok(['unknown', 'estimated'].includes(link.certainty), link.id);
  });
  it('links only works that exist, and every link survives the app merge', () => {
    const ids = new Set([...video.works, ...text.works].map(work => work.id));
    for (const link of text.adaptations) {
      assert.ok(ids.has(link.source_work_id) && ids.has(link.adapted_work_id), link.id);
      assert.notEqual(link.source_work_id, link.adapted_work_id);
    }
    const merged = mergeTextSeed(video, text);
    assert.equal(merged.adaptations.length, text.adaptations.length);
    assert.equal(merged.seed.works.length, video.works.length + text.works.length);
  });
});
