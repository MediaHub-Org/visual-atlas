import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adaptationsFor, catalogueFranchises, clampFormat, clampView, franchiseWorkIds, mediumOfFormat, mergeTextSeed, matchesFormat, parseMedium, facetLists } from '../src/medium.ts';

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
  it('drops links with a missing endpoint or a certainty other than unknown/estimated', () => {
    const t = text();
    t.adaptations.push(
      { id: 'ad2', source_work_id: 'text--db', adapted_work_id: 'nowhere', kind: 'anime', certainty: 'unknown' },
      { id: 'ad3', source_work_id: 'text--db', adapted_work_id: 'text--maus', kind: 'other', certainty: 'disputed' },
      { id: 'ad4', source_work_id: 'text--maus', adapted_work_id: 'series--dragon-ball', kind: 'other', certainty: 'confirmed' },
    );
    const { adaptations } = mergeTextSeed(video, t);
    assert.deepEqual(adaptations.map(a => a.id), ['ad1']);
  });
  it('drops a membership to a work or franchise that does not exist', () => {
    const t = text();
    t.memberships.push({ work_id: 'text--db', franchise_id: 'ghost', continuity_id: null }, { work_id: 'ghost', franchise_id: 'maus', continuity_id: null });
    assert.equal(mergeTextSeed(video, t).seed.memberships.length, 3);
  });
});

describe('review fixes: merge', () => {
  const video = {
    works: [{ id: 'series--a', format: 'series', title: 'A' }],
    franchises: [{ id: 'f', name: 'F' }],
    continuities: [],
    memberships: [{ work_id: 'series--a', franchise_id: 'f' }],
  };
  const base = () => ({
    works: [{ id: 'text--m', format: 'manga_series', title: 'M' }],
    franchises: [],
    continuities: [],
    memberships: [{ work_id: 'text--m', franchise_id: 'f' }],
    adaptations: [],
  });
  const link = (id, extra = {}) => ({ id, source_work_id: 'text--m', adapted_work_id: 'series--a', kind: 'anime', certainty: 'unknown', ...extra });

  it('never shows a confirmed link: only unknown or estimated survive', () => {
    const t = base();
    t.adaptations = [link('a', { certainty: 'confirmed' }), link('b', { kind: 'film', certainty: 'estimated' }), link('c', { kind: 'series' })];
    assert.deepEqual(mergeTextSeed(video, t).adaptations.map(a => a.id), ['b', 'c']);
  });
  it('drops duplicate ids and duplicate (source, adapted, kind) links and unknown kinds', () => {
    const t = base();
    t.adaptations = [link('a'), link('a', { kind: 'film' }), link('b'), link('c', { kind: 'musical' }), link('d', { kind: 'film' })];
    assert.deepEqual(mergeTextSeed(video, t).adaptations.map(a => a.id), ['a', 'd']);
  });
  it('drops a text membership that points at a video work', () => {
    const t = base();
    t.memberships.push({ work_id: 'series--a', franchise_id: 'f' });
    assert.equal(mergeTextSeed(video, t).seed.memberships.length, 2);
  });
});

describe('franchiseWorkIds', () => {
  const memberships = [
    { work_id: 'v1', franchise_id: 'f' },
    { work_id: 't1', franchise_id: 'f' },
    { work_id: 'v1', franchise_id: 'f' },
    { work_id: 'v2', franchise_id: 'g' },
  ];
  const mediumByWork = new Map([['v1', 'video'], ['v2', 'video'], ['t1', 'text']]);
  it('lists a franchise\'s works of one medium, each once', () => {
    assert.deepEqual(franchiseWorkIds('f', memberships, mediumByWork, 'video'), ['v1']);
    assert.deepEqual(franchiseWorkIds('f', memberships, mediumByWork, 'text'), ['t1']);
  });
  it('is identical for video with and without text works present', () => {
    const videoOnly = memberships.filter(m => m.work_id !== 't1');
    assert.deepEqual(franchiseWorkIds('f', memberships, mediumByWork, 'video'), franchiseWorkIds('f', videoOnly, mediumByWork, 'video'));
  });
});

describe('clampView and clampFormat', () => {
  it('keeps a view the medium offers and falls back to cards otherwise', () => {
    assert.equal(clampView('sequence', 'video'), 'sequence');
    assert.equal(clampView('hierarchy', 'video'), 'hierarchy');
    assert.equal(clampView('timeline', 'text'), 'timeline');
    assert.equal(clampView('sequence', 'text'), 'cards');
    assert.equal(clampView('hierarchy', 'text'), 'cards');
    assert.equal(clampView('nonsense', 'video'), 'cards');
  });
  it('keeps a format the medium offers and falls back to All otherwise', () => {
    assert.equal(clampFormat('Film', 'video'), 'Film');
    assert.equal(clampFormat('Manga', 'text'), 'Manga');
    assert.equal(clampFormat('Manga', 'video'), 'All');
    assert.equal(clampFormat('Film', 'text'), 'All');
    assert.equal(clampFormat('All', 'text'), 'All');
  });
});

describe('facetLists (dependent sidebar lists)', () => {
  const work = (id, format, ...franchises) => ({ id, medium: 'text', format, memberships: franchises.map(name => ({ franchiseId: name.toLowerCase(), franchise: name })) });
  const works = [
    work('1', 'Manga', 'Naruto'),
    work('2', 'Manga', 'Bleach'),
    work('3', 'Comic', 'Batman'),
    work('4', 'Comic', 'Hulk'),
    work('5', 'Graphic novel', 'Maus'),
    work('6', 'Manga', 'Doraemon'),
    { id: 'v', medium: 'video', format: 'Series', memberships: [{ franchiseId: 'naruto', franchise: 'Naruto' }] },
  ];
  const names = list => list.map(entry => entry.name ?? entry.id);

  it('with nothing selected lists every text format and franchise with their counts', () => {
    const facets = facetLists(works, 'text', 'All', 'All');
    assert.deepEqual(facets.formats, [{ id: 'Manga', count: 3 }, { id: 'Comic', count: 2 }, { id: 'Graphic novel', count: 1 }]);
    assert.equal(facets.franchises.length, 6);
    assert.ok(!facets.franchises.some(entry => entry.count === 0));
  });
  it('choosing a format narrows the franchise list to franchises that have it', () => {
    assert.deepEqual(names(facetLists(works, 'text', 'Comic', 'All').franchises), ['Batman', 'Hulk']);
    assert.deepEqual(names(facetLists(works, 'text', 'Manga', 'All').franchises), ['Bleach', 'Doraemon', 'Naruto']);
  });
  it('choosing a franchise narrows the format counts to that franchise', () => {
    assert.deepEqual(facetLists(works, 'text', 'All', 'Hulk').formats, [{ id: 'Comic', count: 1 }]);
  });
  it('keeps a selected franchise listed even when the format leaves it empty, so it can be cleared', () => {
    const facets = facetLists(works, 'text', 'Comic', 'Naruto');
    assert.deepEqual(names(facets.franchises), ['Batman', 'Hulk', 'Naruto']);
    assert.equal(facets.franchises.find(entry => entry.name === 'Naruto').count, 0);
  });
  it('ignores video works', () => {
    assert.equal(facetLists(works, 'text', 'All', 'All').franchises.find(entry => entry.name === 'Naruto').count, 1);
  });
});

describe('facetLists in the Watch catalogue and matchesFormat', () => {
  const v = (id, format, anime, ...franchises) => ({ id, medium: 'video', format, anime, memberships: franchises.map(name => ({ franchiseId: name.toLowerCase(), franchise: name })) });
  const works = [v('a', 'Film', false, 'Alien'), v('b', 'Series', true, 'Naruto'), v('c', 'Series', false, 'Alien'), v('d', 'Film', true, 'Doraemon')];
  it('lists Film, Series and Anime with counts, Anime being a flag across both', () => {
    assert.deepEqual(facetLists(works, 'video', 'All', 'All').formats, [{ id: 'Film', count: 2 }, { id: 'Series', count: 2 }, { id: 'Anime', count: 2 }]);
  });
  it('narrows the same way as in Read', () => {
    assert.deepEqual(facetLists(works, 'video', 'Anime', 'All').franchises.map(e => e.name), ['Doraemon', 'Naruto']);
    assert.deepEqual(facetLists(works, 'video', 'All', 'Alien').formats, [{ id: 'Film', count: 1 }, { id: 'Series', count: 1 }]);
  });
  it('matchesFormat: All matches everything, Anime is the flag, others compare the format', () => {
    assert.equal(matchesFormat({ format: 'Film', anime: false }, 'All'), true);
    assert.equal(matchesFormat({ format: 'Film', anime: true }, 'Anime'), true);
    assert.equal(matchesFormat({ format: 'Series', anime: false }, 'Anime'), false);
    assert.equal(matchesFormat({ format: 'Series' }, 'Series'), true);
    assert.equal(matchesFormat({ format: 'Series' }, 'Film'), false);
  });
});
