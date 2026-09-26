import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POOL_LAYOUT, getGroundHeight, isInsidePool, resolveHorizontal } from '../src/world/poolLayout.js';

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);

test('deck outside the pool is at floor level', () => {
  assert.equal(getGroundHeight(0, 9), 0);
  assert.equal(getGroundHeight(-9, -2), 0);
  assert.equal(isInsidePool(0, 9), false);
});

test('pool basin floor is at pool depth', () => {
  assert.equal(isInsidePool(0, -2), true);
  assert.equal(getGroundHeight(0, -2), -POOL_LAYOUT.pool.depth);
});

test('pool steps descend in equal rises and stay within step height', () => {
  const { stepRise } = POOL_LAYOUT.stairs;
  near(getGroundHeight(-4, 2.75), -stepRise, 'top step');
  near(getGroundHeight(-4, 2.25), -2 * stepRise, 'middle step');
  near(getGroundHeight(-4, 1.75), -3 * stepRise, 'bottom step');
  assert.equal(getGroundHeight(-4, 1.2), -POOL_LAYOUT.pool.depth);
  assert.ok(POOL_LAYOUT.pool.depth - 3 * stepRise <= 0.5, 'last step to pool floor fits the player step height');
});

test('water surface is between the deck and the pool floor', () => {
  assert.ok(POOL_LAYOUT.waterLevel < 0);
  assert.ok(POOL_LAYOUT.waterLevel > -POOL_LAYOUT.pool.depth);
});

test('resolveHorizontal keeps the player inside the room walls', () => {
  const position = { x: 20, z: -20 };
  resolveHorizontal(position, 0.35);
  near(position.x, POOL_LAYOUT.halfSize - 0.35, 'x clamp');
  near(position.z, -(POOL_LAYOUT.halfSize - 0.35), 'z clamp');
});

test('resolveHorizontal pushes the player out of pillars', () => {
  const { x, z } = POOL_LAYOUT.pillars[0];
  const position = { x: x + 0.1, z };
  resolveHorizontal(position, 0.35);
  const distance = Math.hypot(position.x - x, position.z - z);
  assert.ok(distance >= POOL_LAYOUT.pillarRadius + 0.35 - 1e-9);
});
