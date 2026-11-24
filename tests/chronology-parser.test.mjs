import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { eraValue, extractTimeline, parseTimeline } from '../scripts/chronology/wookieepedia.mjs';

describe('extractTimeline', () => {
  it('prefers canon_timeline over timeline and drops refs', () => {
    const text = '{{Movie\n|title=X\n|canon_timeline=[[32 BBY]]<ref name="a">x</ref>\n|legends_timeline=[[32 BBY/Legends|32 BBY]]\n|timeline=[[1 ABY]]\n|series=Y\n}}';
    assert.deepEqual(extractTimeline(text), { field: 'canon_timeline', raw: '[[32 BBY]]' });
  });
  it('reads a multi-line timeline field', () => {
    const text = '{{Movie\n|timeline=*[[10 BBY]] {{C|Main story}}\n*[[13 BBY]] {{C|Prologue}}\n|budget=1\n}}';
    assert.equal(extractTimeline(text).raw, '*[[10 BBY]] {{C|Main story}}\n*[[13 BBY]] {{C|Prologue}}');
    assert.equal(extractTimeline(text).field, 'timeline');
  });
  it('returns null without a canon timeline field', () => {
    assert.equal(extractTimeline('{{Movie\n|title=X\n|legends_timeline=[[0 BBY]]\n}}'), null);
  });
});

describe('eraValue', () => {
  it('maps BBY to negative and ABY to positive years', () => {
    assert.equal(eraValue('32 BBY'), -32);
    assert.equal(eraValue('9 ABY'), 9);
    assert.ok(Object.is(eraValue('0 ABY'), 0));
    assert.equal(eraValue('soon'), null);
  });
});

describe('parseTimeline', () => {
  const one = (raw) => parseTimeline(raw).periods;
  it('reads a single year', () => {
    assert.deepEqual(parseTimeline('[[32 BBY]]'), {
      parsed: true,
      periods: [{ label: null, start: -32, end: -32, qualifier: 'exact', primary: true }],
    });
  });
  it('reads ranges with an en dash entity or a hyphen', () => {
    assert.deepEqual([one('[[1 BBY]]&ndash;[[0 ABY]]')[0].start, one('[[1 BBY]]&ndash;[[0 ABY]]')[0].end], [-1, 0]);
    assert.deepEqual([one('[[22 BBY]]&ndash;[[19 BBY]]')[0].start, one('[[22 BBY]]&ndash;[[19 BBY]]')[0].end], [-22, -19]);
  });
  it('reads labelled entries and marks the Main story primary', () => {
    const periods = one('*[[13 BBY]] {{C|Prologue}}\n*[[10 BBY]] {{C|Main story}}');
    assert.deepEqual(periods.map((p) => [p.label, p.start, p.primary]),
      [['Prologue', -13, false], ['Main story', -10, true]]);
  });
  it('makes the first entry primary when none is labelled Main story (Rebels)', () => {
    const periods = one('*[[5 BBY]] - [[1 BBY]]\n*c. [[9 ABY]] {{C|Epilogue}}');
    assert.deepEqual(periods.map((p) => [p.label, p.start, p.end, p.qualifier, p.primary]),
      [[null, -5, -1, 'exact', true], ['Epilogue', 9, 9, 'circa', false]]);
  });
  it('flags "days before" (Rogue One)', () => {
    const periods = one("*[[1 BBY]], days before [[Star Wars: Episode IV A New Hope|''A New Hope'']] {{C|Main story}}\n*[[13 BBY]] {{C|Prologue}}");
    assert.equal(periods[0].start, -1);
    assert.equal(periods[0].qualifier, 'days_before');
    assert.equal(periods[0].primary, true);
  });
  it('flags circa and open-ended dates without inventing an end', () => {
    assert.equal(one('c. [[14 ABY]]')[0].qualifier, 'circa');
    const open = one('During or after [[9 ABY]]')[0];
    assert.deepEqual([open.qualifier, open.start, open.end], ['open_after', 9, null]);
  });
  it('never returns -0 and resolves piped links', () => {
    const p = one('[[0 BBY/Legends|0 BBY]]')[0];
    assert.ok(Object.is(p.start, 0) && Object.is(p.end, 0));
  });
  it('does not guess when there is no era year', () => {
    assert.deepEqual(parseTimeline('sometime later'), { periods: [], parsed: false });
    assert.deepEqual(parseTimeline(''), { periods: [], parsed: false });
  });
});
