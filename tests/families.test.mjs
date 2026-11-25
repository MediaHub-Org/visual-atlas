import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildBlocks, parseFamilies } from '../src/families.ts';

const franchises = [
  { id: 'x-men', name: 'X-Men' },
  { id: 'marvel', name: 'Marvel Cinematic Universe' },
  { id: 'godzilla', name: 'Godzilla' },
  { id: 'spider-man', name: 'Spider-Man' },
];
const marvel = { id: 'marvel', name: 'Marvel', franchises: ['marvel', 'x-men', 'spider-man'] };

describe('parseFamilies', () => {
  it('keeps well-formed families and their same-world notes', () => {
    const [family] = parseFamilies({
      families: [{
        ...marvel,
        same_world: [{ franchise: 'spider-man', continuity: 'spider-man--mcu-solo-films', as_franchise: 'marvel', as_continuity: 'marvel--main-universe' }],
      }],
    });
    assert.deepEqual(family.franchiseIds, ['marvel', 'x-men', 'spider-man']);
    assert.deepEqual(family.sameWorld, [{ continuityId: 'spider-man--mcu-solo-films', asContinuityId: 'marvel--main-universe' }]);
  });
  it('keeps a fan-theory flag, false unless the file says so', () => {
    const families = parseFamilies({ families: [{ ...marvel, theory: true }, { id: 'dc', name: 'DC', franchises: ['batman'] }] });
    assert.deepEqual(families.map(f => f.theory), [true, false]);
  });
  it('drops malformed rows instead of throwing', () => {
    assert.deepEqual(parseFamilies(null), []);
    assert.deepEqual(parseFamilies({ families: [{ id: 3 }, { id: 'a', name: 'A', franchises: 'x' }, { id: 'b', name: 'B', franchises: [] }] }), []);
  });
  it('lets a franchise belong to one family only (the first wins)', () => {
    const families = parseFamilies({ families: [marvel, { id: 'other', name: 'Other', franchises: ['x-men', 'godzilla'] }] });
    assert.deepEqual(families[1].franchiseIds, ['godzilla']);
  });
});

describe('buildBlocks', () => {
  it('puts family franchises in one block and keeps the rest as their own', () => {
    const blocks = buildBlocks(franchises, parseFamilies({ families: [marvel] }));
    assert.deepEqual(blocks.map(b => [b.name, b.franchiseIds, b.family]), [
      ['Godzilla', ['godzilla'], false],
      ['Marvel', ['marvel', 'x-men', 'spider-man'], true],
    ]);
  });
  it('lists only franchises that exist and drops a family with none', () => {
    const blocks = buildBlocks([{ id: 'marvel', name: 'MCU' }], parseFamilies({ families: [marvel, { id: 'dc', name: 'DC', franchises: ['batman'] }] }));
    assert.deepEqual(blocks.map(b => [b.id, b.franchiseIds]), [['marvel', ['marvel']]]);
  });
  it('never loses or repeats a franchise', () => {
    const blocks = buildBlocks(franchises, parseFamilies({ families: [marvel] }));
    assert.deepEqual(blocks.flatMap(b => b.franchiseIds).sort(), franchises.map(f => f.id).sort());
  });
});

describe('the committed families file', () => {
  const file = JSON.parse(readFileSync(new URL('../public/data/universe_families.json', import.meta.url), 'utf8'));
  const seed = JSON.parse(readFileSync(new URL('../public/data/media_atlas_seed.json', import.meta.url), 'utf8'));
  it('only names franchises and continuities that exist in the seed', () => {
    const text = JSON.parse(readFileSync(new URL('../public/data/media_text_seed.json', import.meta.url), 'utf8'));
    const franchiseIds = new Set([...seed.franchises, ...text.franchises].map(f => f.id));
    const continuityIds = new Set(seed.continuities.map(c => c.id));
    for (const family of parseFamilies(file)) {
      for (const id of family.franchiseIds) assert.ok(franchiseIds.has(id), id);
      for (const note of family.sameWorld) {
        assert.ok(continuityIds.has(note.continuityId), note.continuityId);
        assert.ok(continuityIds.has(note.asContinuityId), note.asContinuityId);
      }
    }
  });
  it('holds exactly the families the owner approved (Marvel, DC, Disney/Pixar as a fan theory) and not Insidious', () => {
    const families = parseFamilies(file);
    assert.deepEqual(families.map(f => f.id), ['marvel', 'dc', 'disney-pixar']);
    assert.deepEqual(families.map(f => f.theory), [false, false, true]);
    assert.ok(!families.some(f => f.franchiseIds.includes('insidious')));
    assert.ok(file.approved_by_owner === true);
  });
});
