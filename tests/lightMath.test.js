import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flickerFactor, rankSpecsForPosition, LIGHT_PRIORITY_BIAS } from '../src/world/lightMath.js';

test('flickerFactor stays in a sane range and is deterministic', () => {
  const flicker = { speed: 9, depth: 0.5, phase: 1.3 };
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 400; i += 1) {
    const t = i * 0.037;
    const v = flickerFactor(flicker, t);
    assert.ok(Number.isFinite(v));
    assert.equal(v, flickerFactor(flicker, t), 'not deterministic');
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  assert.ok(max <= 1.0001, `flicker above full intensity: ${max}`);
  assert.ok(min >= 0.03, `flicker below blackout floor: ${min}`);
  assert.ok(min < 0.7, 'flicker never dims — animation would be invisible');
});

test('flickerFactor without a flicker profile is full intensity', () => {
  assert.equal(flickerFactor(null, 12.3), 1);
  assert.equal(flickerFactor(undefined, 0), 1);
});

const spec = (x, y, z, priority, tag) => ({ position: [x, y, z], priority, tag });

test('rankSpecsForPosition prefers near specs but respects priority', () => {
  const specs = [
    spec(0, 0, 0, 0.2, 'near-dive'),
    spec(30, 0, 0, 1.0, 'far-ceiling'),
    spec(8, 0, 0, 0.9, 'mid-pool'),
    spec(-40, 0, 0, 1.0, 'very-far-ceiling')
  ];
  const order = rankSpecsForPosition(specs, { x: 0, y: 0, z: 0 }, 3).map((i) => specs[i].tag);
  // mid-pool: 8 - 12*0.9 = -2.8 beats near-dive: 0 - 12*0.2 = -2.4.
  assert.deepEqual(order, ['mid-pool', 'near-dive', 'far-ceiling']);
  // A priority-1 light beats a priority-0.2 light that is up to BIAS*0.8 m nearer.
  const biased = [
    spec(LIGHT_PRIORITY_BIAS * 0.8 - 1, 0, 0, 0.2, 'low'),
    spec(0, 0, 0, 1.0, 'high')
  ];
  const top = rankSpecsForPosition(biased, { x: 0, y: 0, z: 0 }, 1).map((i) => biased[i].tag);
  assert.deepEqual(top, ['high']);
});

test('rankSpecsForPosition clamps count and keeps generation order on ties', () => {
  const specs = [spec(5, 0, 0, 0.5, 'a'), spec(5, 0, 0, 0.5, 'b'), spec(5, 0, 0, 0.5, 'c')];
  assert.deepEqual(rankSpecsForPosition(specs, { x: 0, y: 0, z: 0 }, 2), [0, 1]);
  assert.deepEqual(rankSpecsForPosition(specs, { x: 0, y: 0, z: 0 }, 99), [0, 1, 2]);
  assert.deepEqual(rankSpecsForPosition(specs, { x: 0, y: 0, z: 0 }, 0), []);
  assert.deepEqual(rankSpecsForPosition([], { x: 0, y: 0, z: 0 }, 4), []);
});
