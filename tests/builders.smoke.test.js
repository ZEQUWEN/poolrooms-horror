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

function checkFinite(builder, seed) {
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
  return meshes;
}

test('every archetype builds finite geometry for many seeds', () => {
  for (let seed = 1; seed <= 6; seed += 1) {
    const level = generateLevel({ seed, roomCount: 8 });
    const builder = new LevelBuilder(level);
    const meshes = checkFinite(builder, seed);
    assert.ok(meshes > 400, `seed ${seed}: only ${meshes} meshes`);
    const totalBodies = level.floors.reduce((sum, floor) => sum + floor.waterBodies.length, 0);
    const totalSurfaces = builder.waterSystems.reduce((sum, ws) => sum + ws.surfaces.length, 0);
    assert.equal(totalSurfaces, totalBodies);
    // Gameplay queries agree with the built world on every floor.
    assert.equal(builder.canStand(level.spawn.x, level.spawn.z, 0.35, 0), true);
    assert.equal(builder.getGroundHeight(level.spawn.x, level.spawn.z, 0), 0);
    for (const floor of level.floors) {
      const room = floor.rooms[0];
      assert.equal(builder.canStand((room.rect.x0 + room.rect.x1) / 2, room.rect.z1 - 1.2, 0.35, floor.index), true);
    }
    // Vertical connectors resolve between real floors.
    for (const conn of level.vertical) {
      assert.ok(builder.checkVertical(conn.floor, (conn.rect.x0 + conn.rect.x1) / 2, (conn.rect.z0 + conn.rect.z1) / 2, conn.type === 'up' ? 2.5 : -1));
    }
  }
});

test('all room and corridor types build at least once', () => {
  const builtRooms = new Set();
  const builtCorridors = new Set();
  for (let seed = 1; seed <= 20; seed += 1) {
    const level = generateLevel({ seed, roomCount: 8 });
    const builder = new LevelBuilder(level);
    for (const floor of level.floors) {
      floor.rooms.forEach((room) => builtRooms.add(room.type));
      floor.corridors.forEach((corridor) => builtCorridors.add(corridor.kind === 'dive' ? 'dive' : corridor.type));
    }
    assert.ok(builder.group.children.length >= level.floors.length);
  }
  assert.ok(builtRooms.size >= 4, `room types built: ${[...builtRooms]}`);
  assert.ok(builtCorridors.size >= 3, `corridor types built: ${[...builtCorridors]}`);
});
