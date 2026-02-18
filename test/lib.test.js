const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseMembers, getTier, formatScore, computeGini, computePercentileFor80 } = require('../lib');

// ============================================================
// parseMembers
// ============================================================
describe('parseMembers', () => {
  it('transforms array-of-arrays to objects', () => {
    const raw = [
      ['name', 'id', 'rank', 'score', 'wus'],
      ['Alice', 1, 10, 5000, 50],
      ['Bob', 2, 20, 3000, 30],
    ];
    const result = parseMembers(raw);
    assert.equal(result.length, 2);
    assert.deepEqual(result[0], { name: 'Alice', id: 1, rank: 10, score: 5000, wus: 50 });
    assert.deepEqual(result[1], { name: 'Bob', id: 2, rank: 20, score: 3000, wus: 30 });
  });

  it('returns already-object arrays as-is', () => {
    const input = [{ name: 'Alice', score: 100 }];
    const result = parseMembers(input);
    assert.deepEqual(result, input);
  });

  it('handles empty array', () => {
    assert.deepEqual(parseMembers([]), []);
  });

  it('handles header-only array (no data rows)', () => {
    const raw = [['name', 'id', 'score']];
    const result = parseMembers(raw);
    assert.equal(result.length, 0);
  });

  it('handles single data row', () => {
    const raw = [
      ['name', 'score'],
      ['Solo', 999],
    ];
    const result = parseMembers(raw);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Solo');
    assert.equal(result[0].score, 999);
  });

  it('preserves null values in data', () => {
    const raw = [
      ['name', 'rank'],
      ['NoRank', null],
    ];
    const result = parseMembers(raw);
    assert.equal(result[0].rank, null);
  });
});

// ============================================================
// getTier
// ============================================================
describe('getTier', () => {
  it('returns Diamond for >= 100B', () => {
    assert.equal(getTier(100e9).name, 'Diamond');
    assert.equal(getTier(500e9).name, 'Diamond');
  });

  it('returns Platinum for >= 10B', () => {
    assert.equal(getTier(10e9).name, 'Platinum');
    assert.equal(getTier(99e9).name, 'Platinum');
  });

  it('returns Gold for >= 1B', () => {
    assert.equal(getTier(1e9).name, 'Gold');
    assert.equal(getTier(9.9e9).name, 'Gold');
  });

  it('returns Silver for >= 100M', () => {
    assert.equal(getTier(100e6).name, 'Silver');
    assert.equal(getTier(999e6).name, 'Silver');
  });

  it('returns Bronze for >= 10M', () => {
    assert.equal(getTier(10e6).name, 'Bronze');
    assert.equal(getTier(99e6).name, 'Bronze');
  });

  it('returns Copper for < 10M', () => {
    assert.equal(getTier(0).name, 'Copper');
    assert.equal(getTier(9e6).name, 'Copper');
    assert.equal(getTier(1000).name, 'Copper');
  });

  it('returns correct boundary values', () => {
    assert.equal(getTier(10e6 - 1).name, 'Copper');
    assert.equal(getTier(10e6).name, 'Bronze');
    assert.equal(getTier(100e6 - 1).name, 'Bronze');
    assert.equal(getTier(100e6).name, 'Silver');
  });

  it('includes a color property', () => {
    const tier = getTier(100e9);
    assert.ok(tier.color);
    assert.ok(tier.color.startsWith('#'));
  });
});

// ============================================================
// formatScore
// ============================================================
describe('formatScore', () => {
  it('formats trillions', () => {
    assert.equal(formatScore(1.5e12), '1.50 T');
    assert.equal(formatScore(1e12), '1.00 T');
  });

  it('formats billions', () => {
    assert.equal(formatScore(367e9), '367.00 B');
    assert.equal(formatScore(1e9), '1.00 B');
  });

  it('formats millions', () => {
    assert.equal(formatScore(5.5e6), '5.5 M');
    assert.equal(formatScore(1e6), '1.0 M');
  });

  it('formats thousands', () => {
    assert.equal(formatScore(1500), '1.5 K');
    assert.equal(formatScore(1e3), '1.0 K');
  });

  it('returns raw number for small values', () => {
    assert.equal(formatScore(999), '999');
    assert.equal(formatScore(0), '0');
    assert.equal(formatScore(42), '42');
  });
});

// ============================================================
// computeGini
// ============================================================
describe('computeGini', () => {
  it('returns 0 for equal distribution', () => {
    const gini = computeGini([100, 100, 100, 100]);
    assert.ok(Math.abs(gini) < 0.001, `Expected ~0, got ${gini}`);
  });

  it('returns high value for unequal distribution', () => {
    const gini = computeGini([0, 0, 0, 1000000]);
    assert.ok(gini > 0.7, `Expected > 0.7, got ${gini}`);
  });

  it('returns value between 0 and 1 for normal data', () => {
    const gini = computeGini([10, 50, 100, 500, 10000]);
    assert.ok(gini >= 0 && gini <= 1, `Expected 0-1, got ${gini}`);
  });

  it('handles empty array', () => {
    assert.equal(computeGini([]), 0);
  });

  it('handles single element', () => {
    assert.equal(computeGini([100]), 0);
  });

  it('handles all zeros', () => {
    assert.equal(computeGini([0, 0, 0]), 0);
  });
});

// ============================================================
// computePercentileFor80
// ============================================================
describe('computePercentileFor80', () => {
  it('calculates correctly for highly skewed data', () => {
    const members = [
      { score: 900 },
      { score: 50 },
      { score: 30 },
      { score: 10 },
      { score: 10 },
    ];
    const result = computePercentileFor80(members);
    assert.equal(result.count, 1); // top member alone has 90%
    assert.equal(result.total, 5);
    assert.equal(result.pct, 20);
  });

  it('calculates correctly for equal distribution', () => {
    const members = Array(10).fill(null).map(() => ({ score: 100 }));
    const result = computePercentileFor80(members);
    assert.equal(result.count, 8); // need 8 of 10 for 80%
    assert.equal(result.total, 10);
  });

  it('handles single member', () => {
    const result = computePercentileFor80([{ score: 1000 }]);
    assert.equal(result.count, 1);
    assert.equal(result.pct, 100);
  });
});
