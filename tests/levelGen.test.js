import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel, ROOM_TYPES, CORRIDOR_TYPES, doorBlocked, GEN_CONFIG } from '../src/world/levelGen.js';

const intersects = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

test('generator is deterministic for a seed', () => {
  const a = generateLevel({ seed: 4242, roomCount: 7 });
  const b = generateLevel({ seed: 4242, roomCount: 7 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const c = generateLevel({ seed: 4243, roomCount: 7 });
  assert.notEqual(JSON.stringify(a.rooms), JSON.stringify(c.rooms));
});

test('levels are connected trees of rooms joined by corridors', () => {
  for (const seed of [1, 7, 99, 1234, 55555]) {
    const level = generateLevel({ seed, roomCount: 7 });
    assert.ok(level.rooms.length >= 5, `seed ${seed}: only ${level.rooms.length} rooms`);
    assert.ok(level.corridors.length >= level.rooms.length - 1);

    const adjacency = new Map(level.rooms.map((room) => [room.id, []]));
    for (const corridor of level.corridors) {
      adjacency.get(corridor.from).push(corridor.to);
      adjacency.get(corridor.to).push(corridor.from);
    }
    const seen = new Set([level.rooms[0].id]);
    const queue = [level.rooms[0].id];
    while (queue.length) {
      for (const next of adjacency.get(queue.shift())) {
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    assert.equal(seen.size, level.rooms.length, `seed ${seed}: disconnected rooms`);
  }
});

test('room footprints never overlap each other', () => {
  for (const seed of [1, 7, 99, 1234, 55555, 818181]) {
    const level = generateLevel({ seed, roomCount: 8 });
    for (let i = 0; i < level.rooms.length; i += 1) {
      for (let j = i + 1; j < level.rooms.length; j += 1) {
        assert.equal(intersects(level.rooms[i].rect, level.rooms[j].rect), false, `seed ${seed}: rooms ${i}/${j} overlap`);
      }
    }
  }
});

test('corridor ends plug into their rooms through the seam', () => {
  for (const seed of [1, 7, 99, 1234]) {
    const level = generateLevel({ seed, roomCount: 7 });
    for (const corridor of level.corridors) {
      const from = level.rooms.find((room) => room.id === corridor.from);
      const to = level.rooms.find((room) => room.id === corridor.to);
      assert.ok(intersects(corridor.rects[0], from.rect), `${corridor.id} misses ${from.id}`);
      assert.ok(intersects(corridor.rects[corridor.rects.length - 1], to.rect), `${corridor.id} misses ${to.id}`);
      if (corridor.rects.length > 1) assert.ok(intersects(corridor.rects[0], corridor.rects[1]), `${corridor.id} L gap`);
      // Doors registered on both ends, wide as the corridor.
      const doorA = from.doors.find((door) => door.corridorId === corridor.id);
      const doorB = to.doors.find((door) => door.corridorId === corridor.id);
      assert.ok(doorA && doorB, `${corridor.id} doors missing`);
      assert.ok(Math.abs(doorA.u1 - doorA.u0 - GEN_CONFIG.corridorWidth) < 1e-9);
      assert.equal(doorBlocked(from, doorA.side, doorA.u0, doorA.u1, doorA.corridorId), false);
      assert.equal(doorBlocked(to, doorB.side, doorB.u0, doorB.u1, doorB.corridorId), false);
    }
  }
});

test('water never floods a doorway seam zone', () => {
  for (const seed of [1, 7, 99, 1234, 55555]) {
    const level = generateLevel({ seed, roomCount: 7 });
    const foots = [
      ...level.rooms.map((room) => ({ rect: room.rect, kind: 'room' })),
      ...level.corridors.flatMap((corridor) => corridor.rects.map((r) => ({ rect: r, kind: 'corridor' })))
    ];
    // Doorway seams = room/corridor overlaps. Corner overlaps inside one
    // L-shaped corridor are interior floor, water may flood them.
    const seams = [];
    for (let i = 0; i < foots.length; i += 1) {
      for (let j = i + 1; j < foots.length; j += 1) {
        if (foots[i].kind === 'corridor' && foots[j].kind === 'corridor') continue;
        if (!intersects(foots[i].rect, foots[j].rect)) continue;
        seams.push({
          x0: Math.max(foots[i].rect.x0, foots[j].rect.x0), z0: Math.max(foots[i].rect.z0, foots[j].rect.z0),
          x1: Math.min(foots[i].rect.x1, foots[j].rect.x1), z1: Math.min(foots[i].rect.z1, foots[j].rect.z1)
        });
      }
    }
    assert.ok(seams.length >= level.corridors.length);
    for (const body of level.waterBodies) {
      for (const seam of seams) assert.equal(intersects(body.rect, seam), false, `seed ${seed}: water ${body.kind} in seam`);
    }
    // Channel rects of one corridor must not overlap each other (z-fighting).
    for (const corridor of level.corridors) {
      for (let i = 0; i < corridor.water.length; i += 1) {
        for (let j = i + 1; j < corridor.water.length; j += 1) {
          assert.equal(intersects(corridor.water[i].rect, corridor.water[j].rect), false, `${corridor.id} water overlap`);
        }
      }
    }
  }
});

test('spawn stands on dry deck inside the first room', () => {
  const level = generateLevel({ seed: 31337, roomCount: 7 });
  const first = level.rooms[0];
  assert.ok(level.spawn.x > first.rect.x0 && level.spawn.x < first.rect.x1);
  assert.ok(level.spawn.z > first.rect.z0 && level.spawn.z < first.rect.z1);
  assert.equal(level.waterBodies.some((body) => body.kind === 'basin'
    && body.owner === first.id
    && level.spawn.x > body.rect.x0 && level.spawn.x < body.rect.x1
    && level.spawn.z > body.rect.z0 && level.spawn.z < body.rect.z1), false);
});

test('all archetypes appear across seeds', () => {
  const roomSeen = new Set();
  const corridorSeen = new Set();
  for (let seed = 1; seed <= 24; seed += 1) {
    const level = generateLevel({ seed, roomCount: 8 });
    level.rooms.forEach((room) => roomSeen.add(room.type));
    level.corridors.forEach((corridor) => corridorSeen.add(corridor.type));
  }
  for (const type of ROOM_TYPES) assert.ok(roomSeen.has(type), `room type ${type} never generated`);
  for (const type of CORRIDOR_TYPES) assert.ok(corridorSeen.has(type), `corridor type ${type} never generated`);
});
