import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adaptationsFor, catalogueFranchises, mediumOfFormat, parseMedium } from '../src/medium.ts';

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
