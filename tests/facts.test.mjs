import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { factsOf, FORMAT_ICONS } from '../src/facts.ts';

const base = { format: 'Film', anime: false, medium: 'video', creators: 'Not supplied in seed', credits: undefined, inWorld: undefined, links: 0 };

describe('factsOf', () => {
  it('gives every format an icon, so no card shows an empty icon slot', () => {
    for (const format of ['Film', 'Series', 'Comic', 'Manga', 'Graphic novel']) assert.ok(FORMAT_ICONS[format], format);
    assert.equal(factsOf({ ...base, format: 'Podcast' }).icon, FORMAT_ICONS.Film);
  });
  it('shows up to two directors of a video work and counts the rest', () => {
    const one = factsOf({ ...base, credits: { directors: [{ name: 'A' }] } });
    assert.deepEqual([one.people, one.peopleKind], ['A', 'director']);
    const many = factsOf({ ...base, credits: { directors: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] } });
    assert.equal(many.people, 'A, B +1');
  });
  it('has no people line when there are no credits', () => {
    assert.deepEqual([factsOf(base).people, factsOf(base).peopleKind], [null, null]);
    assert.equal(factsOf({ ...base, credits: { directors: [] } }).people, null);
  });
  it('shows the creators of a text work, and nothing for the placeholder', () => {
    const text = { ...base, medium: 'text', format: 'Manga', creators: 'Akira Toriyama (Story & Art)' };
    assert.deepEqual([factsOf(text).people, factsOf(text).peopleKind], ['Akira Toriyama (Story & Art)', 'creator']);
    assert.equal(factsOf({ ...text, creators: 'Not supplied in seed' }).people, null);
  });
  it('flags anime, in-world dates and adaptation links', () => {
    const facts = factsOf({ ...base, anime: true, inWorld: {}, links: 2 });
    assert.deepEqual([facts.anime, facts.inWorld, facts.links], [true, true, 2]);
    const none = factsOf(base);
    assert.deepEqual([none.anime, none.inWorld, none.links], [false, false, 0]);
  });
});
