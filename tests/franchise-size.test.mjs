// Owner's rule for a Watch franchise to exist: a weighted score of at least 5, or at least 4 when
// the franchise is very famous (listed below). A film or a series counts 1 (seasons never add);
// a short or an anthology of shorts counts 0.5 each. The weights live here so the rule is one place.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const seed = JSON.parse(readFileSync(new URL('../public/data/media_atlas_seed.json', import.meta.url), 'utf8'));
const WEIGHT = { film: 1, series: 1, short: 0.5 };
const FAMOUS = new Set(['lethal-weapon', 'how-to-train-dragon', 'kung-fu-panda', 'madagascar', 'men-in-black', 'bad-boys', 'expendables', 'mortadelo-y-filemon', 'avatar-airbender', 'mr-bean', 'blade-runner']);
// Franchises the owner asked for by name, with only 2-3 titles of one world: judged by that link, not by size.
const LINKS = new Set(['breaking-bad', 'doctor-who', 'game-of-thrones', 'independent-anime']);

describe('franchise size rule (Watch)', () => {
  const worksById = new Map(seed.works.map(work => [work.id, work]));
  const score = id => {
    const members = new Set(seed.memberships.filter(m => m.franchise_id === id).map(m => m.work_id));
    // a remaster re-releases a work already counted: it never adds to a franchise
    return [...members].reduce((sum, workId) => sum + (worksById.get(workId)?.remaster_of ? 0 : (WEIGHT[worksById.get(workId)?.format] ?? 0)), 0);
  };
  it('holds the explicit inclusions: Game of Thrones with its sequels', () => {
    const titles = seed.memberships.filter(m => m.franchise_id === 'game-of-thrones').map(m => worksById.get(m.work_id)?.title).sort();
    assert.deepEqual(titles, ['A Knight of the Seven Kingdoms', 'Game of Thrones', 'House of the Dragon']);
  });
  it('every franchise scores 5, or 4 when listed as very famous', () => {
    for (const franchise of seed.franchises) {
      if (LINKS.has(franchise.id)) continue;
      const needed = FAMOUS.has(franchise.id) ? 4 : 5;
      assert.ok(score(franchise.id) >= needed, `${franchise.name} scores ${score(franchise.id)}, needs ${needed}`);
    }
  });
});
