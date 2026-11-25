// Owner's rule for a Watch franchise to exist: a weighted score of at least 5, or at least 4 when
// the franchise is very famous (listed below). A film or a series counts 1 (seasons never add);
// a short or an anthology of shorts counts 0.5 each. The weights live here so the rule is one place.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const seed = JSON.parse(readFileSync(new URL('../public/data/media_atlas_seed.json', import.meta.url), 'utf8'));
const WEIGHT = { film: 1, series: 1, short: 0.5 };
const FAMOUS = new Set(['lethal-weapon', 'how-to-train-dragon', 'kung-fu-panda', 'madagascar', 'men-in-black', 'bad-boys', 'expendables', 'mortadelo-y-filemon']);
// Franchises that exist only to link two series of one world (owner request), so they are judged by that link.
const LINKS = new Set(['breaking-bad', 'doctor-who']);

describe('franchise size rule (Watch)', () => {
  const worksById = new Map(seed.works.map(work => [work.id, work]));
  const score = id => {
    const members = new Set(seed.memberships.filter(m => m.franchise_id === id).map(m => m.work_id));
    return [...members].reduce((sum, workId) => sum + (WEIGHT[worksById.get(workId)?.format] ?? 0), 0);
  };
  it('every franchise scores 5, or 4 when listed as very famous', () => {
    for (const franchise of seed.franchises) {
      if (LINKS.has(franchise.id)) continue;
      const needed = FAMOUS.has(franchise.id) ? 4 : 5;
      assert.ok(score(franchise.id) >= needed, `${franchise.name} scores ${score(franchise.id)}, needs ${needed}`);
    }
  });
});
