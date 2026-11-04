import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLookDelta, joystickAxis, clampPitch, PITCH_LIMIT } from '../src/player/lookMath.js';

test('drag right looks right, drag up looks up', () => {
  const start = { yaw: 0, pitch: 0 };
  const right = applyLookDelta(start, 100, 0);
  assert.ok(right.yaw < 0, 'yaw decreases when dragging right');
  assert.equal(right.pitch, 0);
  const up = applyLookDelta(start, 0, -100);
  assert.ok(up.pitch > 0, 'pitch increases when dragging up');
  assert.equal(up.yaw, 0);
});

test('pitch is clamped to the gimbal-safe limit', () => {
  let look = { yaw: 0, pitch: 0 };
  for (let i = 0; i < 500; i += 1) look = applyLookDelta(look, 0, -50);
  assert.equal(look.pitch, PITCH_LIMIT);
  for (let i = 0; i < 500; i += 1) look = applyLookDelta(look, 0, 50);
  assert.equal(look.pitch, -PITCH_LIMIT);
  assert.equal(clampPitch(99), PITCH_LIMIT);
});

test('joystick maps knob offset to a clamped unit axis with a dead zone', () => {
  const idle = joystickAxis(2, -3, 58);
  assert.deepEqual(idle, { x: 0, y: 0, magnitude: 0 });
  const forward = joystickAxis(0, -58, 58);
  assert.ok(Math.abs(forward.y - 1) < 1e-9);
  assert.ok(Math.abs(forward.x) < 1e-9);
  const over = joystickAxis(200, 0, 58);
  assert.ok(Math.abs(over.x - 1) < 1e-9);
  assert.ok(Math.abs(over.magnitude - 1) < 1e-9);
  const half = joystickAxis(0, 29, 58);
  assert.ok(Math.abs(half.y + 0.5) < 1e-9, 'push down = backward');
});
