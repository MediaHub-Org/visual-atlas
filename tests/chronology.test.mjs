import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { axisGroups, formatSpan, formatYear, gapFor, orderConflicts, primaryOf } from '../src/chronology.ts';

const cal = { id: 'star-wars-yavin', name: 'Yavin', eraBefore: 'BBY', eraAfter: 'ABY', anchorEvent: 'Battle of Yavin' };
const period = (start, end = start, qualifier = 'exact', primary = true, label = null) => ({ label, start, end, qualifier, primary });

describe('formatYear', () => {
  it('writes BBY, ABY and the year zero', () => {
    assert.equal(formatYear(-32, cal), '32 BBY');
    assert.equal(formatYear(-1, cal), '1 BBY');
    assert.equal(formatYear(0, cal), '0 ABY');
    assert.equal(formatYear(9, cal), '9 ABY');
  });
});

describe('formatSpan', () => {
  it('writes a range, a single year and an open-ended start', () => {
    assert.equal(formatSpan(period(-22, -19), cal), '22 BBY–19 BBY');
    assert.equal(formatSpan(period(-1, 0), cal), '1 BBY–0 ABY');
    assert.equal(formatSpan(period(-32), cal), '32 BBY');
    assert.equal(formatSpan(period(9, null, 'open_after'), cal), '9 ABY');
  });
});

describe('primaryOf', () => {
  it('returns the primary period, or undefined', () => {
    const periods = [period(-13, -13, 'exact', false, 'Prologue'), period(-10, -10, 'exact', true, 'Main story')];
    assert.equal(primaryOf(periods).start, -10);
    assert.equal(primaryOf([]), undefined);
  });
});

describe('axisGroups', () => {
  it('sorts by primary start and groups ties (Last Jedi / Force Awakens)', () => {
    const works = [
      { id: 'tros', periods: [period(35)] },
      { id: 'tfa', periods: [period(34)] },
      { id: 'tpm', periods: [period(-32)] },
      { id: 'tlj', periods: [period(34)] },
    ];
    assert.deepEqual(axisGroups(works), {
      groups: [{ start: -32, ids: ['tpm'] }, { start: 34, ids: ['tfa', 'tlj'] }, { start: 35, ids: ['tros'] }],
      undated: [],
    });
  });
  it('keeps works without a date in undated, never dropping them', () => {
    const result = axisGroups([{ id: 'a', periods: [] }, { id: 'b', periods: [period(null, null)] }, { id: 'c', periods: [period(0)] }]);
    assert.deepEqual(result.undated, ['a', 'b']);
    assert.deepEqual(result.groups, [{ start: 0, ids: ['c'] }]);
  });
  it('places an open-ended date at its start', () => {
    const result = axisGroups([{ id: 'ahsoka', periods: [period(9, null, 'open_after')] }, { id: 'mando', periods: [period(9)] }]);
    assert.deepEqual(result.groups, [{ start: 9, ids: ['ahsoka', 'mando'] }]);
  });
  it('sorts across the BBY/ABY boundary', () => {
    const result = axisGroups([{ id: 'x', periods: [period(0)] }, { id: 'y', periods: [period(-1)] }]);
    assert.deepEqual(result.groups.map((g) => g.start), [-1, 0]);
  });
});

describe('gapFor', () => {
  it('is fixed when equal and clamped when proportional', () => {
    assert.equal(gapFor(5, 'equal'), 30);
    assert.equal(gapFor(1, 'proportional'), 24);
    assert.equal(gapFor(10, 'proportional'), 160);
    assert.equal(gapFor(100, 'proportional'), 340);
  });
});

describe('orderConflicts', () => {
  it('reports consecutive dated works whose dates decrease', () => {
    assert.deepEqual(orderConflicts(['a', 'b', 'c'], new Map([['a', 5], ['b', 3], ['c', 4]])), [{ earlier: 'a', later: 'b' }]);
  });
  it('skips undated works and treats equal starts as no conflict', () => {
    assert.deepEqual(orderConflicts(['a', 'x', 'b'], new Map([['a', 1], ['b', 2]])), []);
    assert.deepEqual(orderConflicts(['a', 'b'], new Map([['a', 34], ['b', 34]])), []);
  });
  it('compares across an undated work', () => {
    assert.deepEqual(orderConflicts(['a', 'x', 'b'], new Map([['a', 9], ['b', 2]])), [{ earlier: 'a', later: 'b' }]);
  });
});
