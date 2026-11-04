import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM stub so the procedural texture generators run under Node.
function makeContext2D() {
  const noop = () => {};
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    fillRect: noop, stroke: noop, beginPath: noop, moveTo: noop, lineTo: noop,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: noop
  };
}
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => makeContext2D() })
};

const { generateLevel } = await import('../src/world/levelGen.js');
const { LevelBuilder } = await import('../src/world/LevelBuilder.js');

test('every archetype builds finite geometry for many seeds', () => {
  for (let seed = 1; seed <= 10; seed += 1) {
    const level = generateLevel({ seed, roomCount: 8 });
    const builder = new LevelBuilder(level);
    let meshes = 0;
    builder.group.traverse((object) => {
      if (!object.isMesh) return;
      meshes += 1;
      const p = object.position;
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z), `seed ${seed}: NaN position in ${object.name || object.type}`);
      const pos = object.geometry?.attributes?.position;
      if (pos) {
        for (let i = 0; i < Math.min(pos.count, 40) * pos.itemSize; i += 1) {
          assert.ok(Number.isFinite(pos.array[i]), `seed ${seed}: NaN vertex`);
        }
      }
    });
    assert.ok(meshes > 120, `seed ${seed}: only ${meshes} meshes`);
    assert.equal(builder.waterSystem.surfaces.length, level.waterBodies.length);
    // Gameplay queries agree with the built world.
    assert.equal(builder.canStand(level.spawn.x, level.spawn.z, 0.35), true);
    assert.equal(builder.getGroundHeight(level.spawn.x, level.spawn.z), 0);
  }
});

test('all room and corridor types build at least once', () => {
  const builtRooms = new Set();
  const builtCorridors = new Set();
  for (let seed = 1; seed <= 20; seed += 1) {
    const level = generateLevel({ seed, roomCount: 8 });
    const builder = new LevelBuilder(level);
    level.rooms.forEach((room) => builtRooms.add(room.type));
    level.corridors.forEach((corridor) => builtCorridors.add(corridor.type));
    assert.ok(builder.group.children.length >= level.rooms.length + level.corridors.length + 1);
  }
  assert.ok(builtRooms.size >= 4, `room types built: ${[...builtRooms]}`);
  assert.ok(builtCorridors.size >= 3, `corridor types built: ${[...builtCorridors]}`);
});
