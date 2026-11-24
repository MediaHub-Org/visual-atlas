import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adaptationsFor, catalogueFranchises, mediumOfFormat, mergeTextSeed, parseMedium } from '../src/medium.ts';

describe('mediumOfFormat', () => {
  it('maps the four video formats and the three text formats', () => {
    for (const format of ['film', 'series', 'season', 'episode']) assert.equal(mediumOfFormat(format), 'video', format);
    for (const format of ['comic_series', 'manga_series', 'graphic_novel']) assert.equal(mediumOfFormat(format), 'text', format);
  });
  it('treats an unknown format as video, never as text', () => {
    assert.equal(mediumOfFormat('podcast'), 'video');
    assert.equal(mediumOfFormat(''), 'video');
  });
});

describe('parseMedium', () => {
  it('reads "text" and defaults everything else to video', () => {
    assert.equal(parseMedium('text'), 'text');
    for (const raw of ['video', '', null, 'TEXT', 'comics']) assert.equal(parseMedium(raw), 'video', String(raw));
  });
});

describe('catalogueFranchises', () => {
  const franchises = [{ id: 'dragon-ball' }, { id: 'maus' }, { id: 'godzilla' }];
  const works = [
    { id: 'a', medium: 'video', memberships: [{ franchiseId: 'dragon-ball' }, { franchiseId: 'godzilla' }] },
    { id: 'b', medium: 'text', memberships: [{ franchiseId: 'dragon-ball' }] },
    { id: 'c', medium: 'text', memberships: [{ franchiseId: 'maus' }] },
  ];
  it('lists only franchises with a work of that medium', () => {
    assert.deepEqual(catalogueFranchises(franchises, works, 'video').map(f => f.id), ['dragon-ball', 'godzilla']);
    assert.deepEqual(catalogueFranchises(franchises, works, 'text').map(f => f.id), ['dragon-ball', 'maus']);
  });
  it('hides a text-only franchise in video mode and the reverse', () => {
    assert.ok(!catalogueFranchises(franchises, works, 'video').some(f => f.id === 'maus'));
    assert.ok(!catalogueFranchises(franchises, works, 'text').some(f => f.id === 'godzilla'));
  });
  it('copes with no works', () => {
    assert.deepEqual(catalogueFranchises(franchises, [], 'text'), []);
  });
});

describe('adaptationsFor', () => {
  const all = [
    { id: '1', sourceId: 'manga', adaptedId: 'anime', kind: 'anime', certainty: 'unknown' },
    { id: '2', sourceId: 'film', adaptedId: 'manga', kind: 'comic', certainty: 'estimated' },
    { id: '3', sourceId: 'manga', adaptedId: 'gone', kind: 'anime', certainty: 'unknown' },
  ];
  const exists = id => id !== 'gone';
  it('splits links by direction for the work', () => {
    const forManga = adaptationsFor('manga', all, exists);
    assert.deepEqual(forManga.asSource.map(a => a.id), ['1']);
    assert.deepEqual(forManga.asAdapted.map(a => a.id), ['2']);
    assert.deepEqual(adaptationsFor('anime', all, exists).asAdapted.map(a => a.id), ['1']);
  });
  it('drops a link whose other end is not loaded', () => {
    assert.deepEqual(adaptationsFor('manga', all, exists).asSource.map(a => a.id), ['1']);
    const noManga = adaptationsFor('anime', all, id => id !== 'manga');
    assert.deepEqual(noManga, { asSource: [], asAdapted: [] });
  });
  it('is empty for a work with no links or no data', () => {
    assert.deepEqual(adaptationsFor('x', [], exists), { asSource: [], asAdapted: [] });
    assert.deepEqual(adaptationsFor('x', all, exists), { asSource: [], asAdapted: [] });
  });
});

describe('mergeTextSeed', () => {
  const video = {
    works: [{ id: 'series--dragon-ball', format: 'series', title: 'Dragon Ball' }],
    franchises: [{ id: 'dragon-ball', name: 'Dragon Ball' }],
    continuities: [],
    memberships: [{ work_id: 'series--dragon-ball', franchise_id: 'dragon-ball', continuity_id: null }],
  };
  const text = () => ({
    works: [
      { id: 'text--db', format: 'manga_series', title: 'Dragon Ball (manga)' },
      { id: 'text--maus', format: 'graphic_novel', title: 'Maus' },
    ],
    franchises: [{ id: 'maus', name: 'Maus' }],
    continuities: [],
    memberships: [
      { work_id: 'text--db', franchise_id: 'dragon-ball', continuity_id: null },
      { work_id: 'text--maus', franchise_id: 'maus', continuity_id: null },
    ],
    adaptations: [{ id: 'ad1', source_work_id: 'text--db', adapted_work_id: 'series--dragon-ball', kind: 'anime', certainty: 'unknown' }],
  });

  it('adds text works, franchises, memberships and links to the video seed', () => {
    const { seed, adaptations } = mergeTextSeed(video, text());
    assert.deepEqual(seed.works.map(w => w.id), ['series--dragon-ball', 'text--db', 'text--maus']);
    assert.deepEqual(seed.franchises.map(f => f.id), ['dragon-ball', 'maus']);
    assert.equal(seed.memberships.length, 3);
    assert.deepEqual(adaptations, [{ id: 'ad1', sourceId: 'text--db', adaptedId: 'series--dragon-ball', kind: 'anime', certainty: 'unknown' }]);
  });
  it('returns the video seed untouched when the text seed is absent or malformed', () => {
    for (const raw of [null, undefined, 'x', 3, [], {}]) {
      const merged = mergeTextSeed(video, raw);
      assert.equal(merged.seed, video, String(raw));
      assert.deepEqual(merged.adaptations, []);
    }
  });
  it('drops rows that collide with a video id, are not text formats, or are malformed', () => {
    const bad = text();
    bad.works.push({ id: 'series--dragon-ball', format: 'manga_series', title: 'Clash' }, { id: 'film--x', format: 'film', title: 'Film' }, { id: 7, format: 'manga_series', title: 'No id' }, null);
    const { seed } = mergeTextSeed(video, bad);
    assert.deepEqual(seed.works.map(w => w.id), ['series--dragon-ball', 'text--db', 'text--maus']);
    assert.equal(seed.works[0].format, 'series');
  });
  it('drops links with a missing endpoint or an unknown certainty, keeps all three valid certainties', () => {
    const t = text();
    t.adaptations.push(
      { id: 'ad2', source_work_id: 'text--db', adapted_work_id: 'nowhere', kind: 'anime', certainty: 'unknown' },
      { id: 'ad3', source_work_id: 'text--db', adapted_work_id: 'text--maus', kind: 'other', certainty: 'disputed' },
      { id: 'ad4', source_work_id: 'text--maus', adapted_work_id: 'series--dragon-ball', kind: 'other', certainty: 'confirmed' },
    );
    const { adaptations } = mergeTextSeed(video, t);
    assert.deepEqual(adaptations.map(a => a.id), ['ad1', 'ad4']);
  });
  it('drops a membership to a work or franchise that does not exist', () => {
    const t = text();
    t.memberships.push({ work_id: 'text--db', franchise_id: 'ghost', continuity_id: null }, { work_id: 'ghost', franchise_id: 'maus', continuity_id: null });
    assert.equal(mergeTextSeed(video, t).seed.memberships.length, 3);
  });
});
