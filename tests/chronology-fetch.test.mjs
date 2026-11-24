import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { calendar, pages } from '../scripts/chronology/star-wars-pages.mjs';
import { buildEntry } from '../scripts/fetch-wookieepedia-dates.mjs';

const seed = JSON.parse(readFileSync(new URL('../public/data/media_atlas_seed.json', import.meta.url), 'utf8'));
const now = new Date('2026-11-24T12:00:00Z');
const apiPage = (text, title = 'Some page') => ({ title, revisions: [{ slots: { main: { '*': text } } }] });

describe('buildEntry', () => {
  it('builds a dated entry with provenance', () => {
    const title = 'Star Wars: Episode I The Phantom Menace';
    const entry = buildEntry('film--the-phantom-menace--1999', title,
      apiPage('{{Movie\n|canon_timeline=[[32 BBY]]\n|series=x\n}}', title), 123456, now);
    assert.equal(entry.parsed, true);
    assert.equal(entry.periods[0].start, -32);
    assert.equal(entry.revision, 123456);
    assert.equal(entry.field, 'canon_timeline');
    assert.equal(entry.raw, '[[32 BBY]]');
    assert.equal(entry.retrievedAt, '2026-11-24T12:00:00.000Z');
    assert.equal(entry.url, 'https://starwars.fandom.com/wiki/Star_Wars:_Episode_I_The_Phantom_Menace');
  });
  it('returns an error, never an invented entry, when the page has no timeline', () => {
    const result = buildEntry('w', 'Some page', apiPage('{{Movie\n|title=x\n}}'), 1, now);
    assert.ok(result.error);
    assert.equal(result.periods, undefined);
  });
  it('keeps the raw string with no periods when it cannot be parsed', () => {
    const entry = buildEntry('w', 'Some page', apiPage('{{Movie\n|timeline=sometime later\n}}'), 1, now);
    assert.equal(entry.parsed, false);
    assert.deepEqual(entry.periods, []);
    assert.equal(entry.raw, 'sometime later');
  });
});

describe('page map', () => {
  it('maps only works that exist in the seed, 18 of them', () => {
    const ids = new Set(seed.works.map((work) => work.id));
    assert.equal(Object.keys(pages).length, 18);
    for (const id of Object.keys(pages)) assert.ok(ids.has(id), `${id} is not in the seed`);
  });
  it('defines the Yavin calendar the data file carries', () => {
    assert.equal(calendar.id, 'star-wars-yavin');
    assert.equal(calendar.era_before, 'BBY');
    assert.equal(calendar.era_after, 'ABY');
    assert.equal(calendar.franchise, 'star-wars');
  });
});
