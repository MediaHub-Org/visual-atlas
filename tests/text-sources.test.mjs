import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adaptationProposals, chooseTitle, imageType, parseAniListMedia, parseComicVineSearch } from '../scripts/text-sources.mjs';
import { textMetadataFor } from '../src/medium.ts';

const aniList = {
  data: {
    Media: {
      id: 30042,
      title: { romaji: 'Dragon Ball', english: 'Dragon Ball', native: 'ドラゴンボール' },
      startDate: { year: 1984 },
      status: 'FINISHED',
      coverImage: { large: 'https://s4.anilist.co/file/cover.jpg' },
      staff: { edges: [{ role: 'Story & Art', node: { name: { full: 'Akira Toriyama' } } }] },
      relations: {
        edges: [
          { relationType: 'ADAPTATION', node: { id: 223, type: 'ANIME', format: 'TV', title: { romaji: 'Dragon Ball', english: null } } },
          { relationType: 'SIDE_STORY', node: { id: 5, type: 'MANGA', format: 'MANGA', title: { romaji: 'Other', english: null } } },
        ],
      },
    },
  },
};

describe('parseAniListMedia', () => {
  it('reads year, creators, cover and relations from a full response', () => {
    const media = parseAniListMedia(aniList);
    assert.equal(media.id, 30042);
    assert.equal(media.year, 1984);
    assert.deepEqual(media.titles, ['Dragon Ball', 'Dragon Ball', 'ドラゴンボール']);
    assert.deepEqual(media.creators, [{ name: 'Akira Toriyama', role: 'Story & Art' }]);
    assert.equal(media.coverUrl, 'https://s4.anilist.co/file/cover.jpg');
    assert.equal(media.relations.length, 2);
  });
  it('keeps only the people who made the work, not translators or assistants', () => {
    const staffed = structuredClone(aniList);
    staffed.data.Media.staff.edges.push(
      { role: 'Translator (French)', node: { name: { full: 'T' } } },
      { role: 'Assistant', node: { name: { full: 'A' } } },
      { role: 'Original Creator', node: { name: { full: 'O' } } },
      { role: 'Story', node: { name: { full: 'S' } } },
      { role: 'Art', node: { name: { full: 'R' } } },
    );
    assert.deepEqual(parseAniListMedia(staffed).creators.map(c => c.name), ['Akira Toriyama', 'O', 'S', 'R']);
  });
  it('returns null, never throws, on malformed or empty input', () => {
    for (const bad of [null, undefined, 3, 'x', [], {}, { data: null }, { data: { Media: null } }, { data: { Media: { id: 'x' } } }]) {
      assert.equal(parseAniListMedia(bad), null, JSON.stringify(bad));
    }
  });
  it('drops a cover that is not an https URL and a year that is not a plausible year', () => {
    const odd = structuredClone(aniList);
    odd.data.Media.coverImage.large = 'javascript:alert(1)';
    odd.data.Media.startDate.year = 12;
    const media = parseAniListMedia(odd);
    assert.equal(media.coverUrl, null);
    assert.equal(media.year, null);
  });
});

describe('parseComicVineSearch', () => {
  const search = {
    status_code: 1,
    results: [
      { id: 91, name: 'Batman', start_year: '1940', publisher: { name: 'DC Comics' }, image: { original_url: 'https://comicvine.gamespot.com/a/b.jpg' } },
      { id: 92, name: 'Batman', start_year: '2011', publisher: null, image: null },
      { id: 'x' },
    ],
  };
  it('reads the well-formed candidates and skips the rest', () => {
    const rows = parseComicVineSearch(search);
    assert.deepEqual(rows.map(row => [row.id, row.title, row.year, row.publisher]), [[91, 'Batman', 1940, 'DC Comics'], [92, 'Batman', 2011, null]]);
    assert.equal(rows[0].coverUrl, 'https://comicvine.gamespot.com/a/b.jpg');
    assert.equal(rows[1].coverUrl, null);
  });
  it('returns an empty list on malformed input', () => {
    for (const bad of [null, 3, {}, { results: 'x' }]) assert.deepEqual(parseComicVineSearch(bad), []);
  });
});

describe('chooseTitle', () => {
  const rows = [
    { id: 1, title: 'Batman', year: 1940 },
    { id: 2, title: 'Batman', year: 2011 },
    { id: 3, title: 'Batman Beyond', year: 1999 },
  ];
  it('accepts exactly one exact normalised title, using the year to break a tie', () => {
    assert.equal(chooseTitle(rows, 'Batman', 1940).id, 1);
    assert.equal(chooseTitle(rows, 'batman beyond', null).id, 3);
  });
  it('refuses a tie it cannot break and a title that is not there', () => {
    assert.equal(chooseTitle(rows, 'Batman', null), null);
    assert.equal(chooseTitle(rows, 'Superman', null), null);
  });
});

describe('adaptationProposals', () => {
  it('turns ADAPTATION relations into proposals, never into seed-shaped rows', () => {
    const proposals = adaptationProposals('text--dragon-ball-manga', parseAniListMedia(aniList));
    assert.deepEqual(proposals, [{ sourceWorkId: 'text--dragon-ball-manga', adaptedTitle: 'Dragon Ball', kind: 'anime', source: 'anilist', sourceRef: 223 }]);
    for (const proposal of proposals) {
      assert.equal(proposal.id, undefined);
      assert.equal(proposal.certainty, undefined);
      assert.equal(proposal.adapted_work_id, undefined);
    }
  });
  it('is empty when there is no media', () => {
    assert.deepEqual(adaptationProposals('x', null), []);
  });
});

describe('textMetadataFor', () => {
  const now = Date.parse('2026-11-24T00:00:00Z');
  const cache = {
    entries: {
      fresh: { source: 'anilist', sourceId: 1, year: 1984, creators: [{ name: 'A', role: 'Story' }], expires: '2027-01-01T00:00:00Z' },
      stale: { source: 'anilist', sourceId: 2, year: 1990, creators: [], expires: '2026-01-01T00:00:00Z' },
      noexpiry: { source: 'anilist', sourceId: 3, year: 2000, creators: [] },
      bad: { source: 'anilist', sourceId: 4, year: 'x', creators: 'nope', expires: '2027-01-01T00:00:00Z' },
    },
  };
  it('returns a fresh entry', () => {
    assert.deepEqual(textMetadataFor(cache, 'fresh', now), { source: 'anilist', year: 1984, creators: [{ name: 'A', role: 'Story' }] });
  });
  it('ignores an entry past its expiry, or with none', () => {
    assert.equal(textMetadataFor(cache, 'stale', now), null);
    assert.equal(textMetadataFor(cache, 'noexpiry', now), null);
  });
  it('ignores a missing work, a malformed cache and malformed fields', () => {
    assert.equal(textMetadataFor(cache, 'nobody', now), null);
    for (const bad of [null, 3, {}, { entries: 'x' }]) assert.equal(textMetadataFor(bad, 'fresh', now), null);
    assert.deepEqual(textMetadataFor(cache, 'bad', now), { source: 'anilist', year: null, creators: [] });
  });
});

describe('imageType', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
  it('accepts JPEG, PNG and WebP whose bytes agree with the declared type', () => {
    assert.equal(imageType('image/jpeg', jpg), 'jpg');
    assert.equal(imageType('image/png', png), 'png');
    assert.equal(imageType('image/webp', webp), 'webp');
    assert.equal(imageType('image/png; charset=binary', png), 'png');
  });
  it('refuses a declared type that the bytes contradict, and anything else', () => {
    assert.equal(imageType('image/png', jpg), null);
    assert.equal(imageType('image/jpeg', png), null);
    assert.equal(imageType('image/svg+xml', Uint8Array.from([0x3c, 0x73, 0x76, 0x67])), null);
    assert.equal(imageType('text/html', jpg), null);
    assert.equal(imageType(null, jpg), null);
    assert.equal(imageType('image/jpeg', new Uint8Array(0)), null);
  });
});
