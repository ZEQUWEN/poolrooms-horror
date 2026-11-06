import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel, ROOM_TYPES, CORRIDOR_TYPES, doorBlocked, GEN_CONFIG } from '../src/world/levelGen.js';

const intersects = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const allFloors = (level) => level.floors;

test('generator is deterministic for a seed', () => {
  const a = generateLevel({ seed: 4242, roomCount: 7 });
  const b = generateLevel({ seed: 4242, roomCount: 7 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const c = generateLevel({ seed: 4243, roomCount: 7 });
  assert.notEqual(JSON.stringify(a.floors[0].rooms), JSON.stringify(c.floors[0].rooms));
});

test('every floor is a connected graph of rooms and corridors', () => {
  for (const seed of [1, 7, 99, 1234, 55555]) {
    const level = generateLevel({ seed, roomCount: 7 });
    assert.equal(level.floors.length, 3, `seed ${seed}: floor count`);
    for (const floor of allFloors(level)) {
      assert.ok(floor.rooms.length >= 3, `seed ${seed} floor ${floor.index}: only ${floor.rooms.length} rooms`);
      const adjacency = new Map(floor.rooms.map((room) => [room.id, []]));
      for (const corridor of floor.corridors) {
        adjacency.get(corridor.from).push(corridor.to);
        adjacency.get(corridor.to).push(corridor.from);
      }
      const seen = new Set([floor.rooms[0].id]);
      const queue = [floor.rooms[0].id];
      while (queue.length) {
        for (const next of adjacency.get(queue.shift())) {
          if (!seen.has(next)) { seen.add(next); queue.push(next); }
        }
      }
      assert.equal(seen.size, floor.rooms.length, `seed ${seed} floor ${floor.index}: disconnected`);
      // Rings: at least the main floor should sometimes close loops.
      if (floor.index === 0) assert.ok(floor.corridors.length >= floor.rooms.length - 1);
    }
  }
  // Across seeds the main floor produces graph rings (extra edges).
  let rings = 0;
  for (let seed = 1; seed <= 12; seed += 1) {
    const level = generateLevel({ seed, roomCount: 8 });
    const f = level.floors[0];
    if (f.corridors.length > f.rooms.length - 1) rings += 1;
  }
  assert.ok(rings >= 3, `loop closures too rare: ${rings}/12`);
});

test('room footprints never overlap each other on any floor', () => {
  for (const seed of [1, 7, 99, 1234, 55555, 818181]) {
    for (const floor of allFloors(generateLevel({ seed, roomCount: 8 }))) {
      for (let i = 0; i < floor.rooms.length; i += 1) {
        for (let j = i + 1; j < floor.rooms.length; j += 1) {
          assert.equal(intersects(floor.rooms[i].rect, floor.rooms[j].rect), false, `seed ${seed} f${floor.index}: rooms ${i}/${j}`);
        }
      }
    }
  }
});

test('walk corridors plug into rooms through doors; dive tunnels through basin mouths', () => {
  for (const seed of [1, 7, 99, 1234]) {
    const level = generateLevel({ seed, roomCount: 7 });
    for (const floor of allFloors(level)) {
      for (const corridor of floor.corridors) {
        const from = floor.rooms.find((room) => room.id === corridor.from);
        const to = floor.rooms.find((room) => room.id === corridor.to);
        if (corridor.kind === 'walk') {
          assert.ok(intersects(corridor.rects[0], from.rect), `${corridor.id} misses ${from.id}`);
          assert.ok(intersects(corridor.rects[corridor.rects.length - 1], to.rect), `${corridor.id} misses ${to.id}`);
          if (corridor.rects.length > 1) assert.ok(intersects(corridor.rects[0], corridor.rects[1]), `${corridor.id} L gap`);
          const doorA = from.doors.find((door) => door.corridorId === corridor.id);
          const doorB = to.doors.find((door) => door.corridorId === corridor.id);
          assert.ok(doorA && doorB, `${corridor.id} doors missing`);
          assert.ok(Math.abs(doorA.u1 - doorA.u0 - GEN_CONFIG.corridorWidth) < 1e-9);
          assert.equal(doorBlocked(from, doorA.side, doorA.u0, doorA.u1, doorA.corridorId), false);
          assert.equal(doorBlocked(to, doorB.side, doorB.u0, doorB.u1, doorB.corridorId), false);
        } else {
          // Dive tunnel: mouths registered on both basins, below the water line.
          const ba = from.features.basins[0];
          const bb = to.features.basins[0];
          assert.ok(ba.mouths.length === 1 && bb.mouths.length === 1, `${corridor.id} mouths`);
          for (const mouth of [...ba.mouths, ...bb.mouths]) {
            assert.ok(mouth.top < Math.min(ba.level, bb.level), `${corridor.id} mouth not flooded`);
            assert.ok(mouth.bottom <= -Math.min(ba.depth, bb.depth) + 1e-9, `${corridor.id} mouth floor`);
            assert.ok(mouth.top - mouth.bottom >= 0.9, `${corridor.id} mouth too low`);
          }
          assert.ok(corridor.noClip, 'dive tunnels must not clip room walls');
        }
      }
    }
  }
});

test('water never floods a doorway seam; dive water only touches basins', () => {
  for (const seed of [1, 7, 99, 1234, 55555]) {
    const level = generateLevel({ seed, roomCount: 7 });
    for (const floor of allFloors(level)) {
      const walkFeet = [
        ...floor.rooms.map((room) => ({ rect: room.rect, kind: 'room' })),
        ...floor.corridors.filter((c) => c.kind === 'walk').flatMap((c) => c.rects.map((r) => ({ rect: r, kind: 'corridor' })))
      ];
      const seams = [];
      for (let i = 0; i < walkFeet.length; i += 1) {
        for (let j = i + 1; j < walkFeet.length; j += 1) {
          if (walkFeet[i].kind === 'corridor' && walkFeet[j].kind === 'corridor') continue;
          if (!intersects(walkFeet[i].rect, walkFeet[j].rect)) continue;
          seams.push({
            x0: Math.max(walkFeet[i].rect.x0, walkFeet[j].rect.x0), z0: Math.max(walkFeet[i].rect.z0, walkFeet[j].rect.z0),
            x1: Math.min(walkFeet[i].rect.x1, walkFeet[j].rect.x1), z1: Math.min(walkFeet[i].rect.z1, walkFeet[j].rect.z1)
          });
        }
      }
      for (const body of floor.waterBodies) {
        for (const seam of seams) assert.equal(intersects(body.rect, seam), false, `seed ${seed} f${floor.index}: water in seam`);
      }
      for (const corridor of floor.corridors.filter((c) => c.kind === 'walk')) {
        for (let i = 0; i < corridor.water.length; i += 1) {
          for (let j = i + 1; j < corridor.water.length; j += 1) {
            assert.equal(intersects(corridor.water[i].rect, corridor.water[j].rect), false, `${corridor.id} water overlap`);
          }
        }
      }
      // Dive tunnels must not overlap walk corridors or other rooms' basins.
      for (const dive of floor.corridors.filter((c) => c.kind === 'dive')) {
        for (const other of floor.corridors.filter((c) => c.kind === 'walk')) {
          assert.equal(other.rects.some((r) => intersects(r, dive.rects[0])), false, `${dive.id} crosses ${other.id}`);
        }
      }
    }
  }
});

test('vertical connectors pair stairwells across floors and land on deck', () => {
  let pairs = 0;
  for (const seed of [1, 7, 99, 1234, 55555]) {
    const level = generateLevel({ seed, roomCount: 7 });
    for (const conn of level.vertical) {
      pairs += 1;
      const floor = level.floors[conn.floor];
      const room = floor.rooms.find((r) => r.features.stairwell && (conn.type === 'up' ? r.features.stairwell.zone === conn.rect : intersects(r.features.stairwell.zone, conn.rect)));
      assert.ok(room, `connector ${conn.id} has no stairwell room`);
      const target = level.floors[conn.toFloor];
      assert.ok(target.rooms.some((r) => r.rect.x0 < conn.to.x && conn.to.x < r.rect.x1 && r.rect.z0 < conn.to.z && conn.to.z < r.rect.z1), `${conn.id} arrival outside rooms`);
    }
  }
  assert.ok(pairs >= 4, `too few vertical connectors: ${pairs}`);
});

test('spawn stands on dry deck inside the first room', () => {
  const level = generateLevel({ seed: 31337, roomCount: 7 });
  const first = level.floors[0].rooms[0];
  assert.equal(level.spawn.floor, 0);
  assert.ok(level.spawn.x > first.rect.x0 && level.spawn.x < first.rect.x1);
  assert.ok(level.spawn.z > first.rect.z0 && level.spawn.z < first.rect.z1);
  assert.equal(level.floors[0].waterBodies.some((body) => body.kind === 'basin'
    && body.owner === first.id
    && level.spawn.x > body.rect.x0 && level.spawn.x < body.rect.x1
    && level.spawn.z > body.rect.z0 && level.spawn.z < body.rect.z1), false);
});

test('all archetypes appear across seeds', () => {
  const roomSeen = new Set();
  const corridorSeen = new Set();
  for (let seed = 1; seed <= 24; seed += 1) {
    const level = generateLevel({ seed, roomCount: 8 });
    for (const floor of allFloors(level)) {
      floor.rooms.forEach((room) => roomSeen.add(room.type));
      floor.corridors.forEach((corridor) => corridorSeen.add(corridor.kind === 'dive' ? 'dive' : corridor.type));
    }
  }
  for (const type of [...ROOM_TYPES, 'stairwell']) assert.ok(roomSeen.has(type), `room type ${type} never generated`);
  for (const type of [...CORRIDOR_TYPES, 'dive']) assert.ok(corridorSeen.has(type), `corridor type ${type} never generated`);
});

test('wall windows stay on solid spans: inside walls, clear of doors and decor', () => {
  let total = 0;
  for (const seed of [1, 7, 99, 1234, 55555]) {
    for (const floor of allFloors(generateLevel({ seed, roomCount: 7 }))) {
      for (const room of floor.rooms) {
        const wins = room.features.decor.wallWindows ?? [];
        total += wins.length;
        assert.ok(wins.length <= 4, `${room.id}: too many windows`);
        for (const win of wins) {
          const alongX = win.side === 'N' || win.side === 'S';
          const [s0, s1] = alongX ? [room.rect.x0, room.rect.x1] : [room.rect.z0, room.rect.z1];
          assert.ok(['N', 'S', 'E', 'W'].includes(win.side), `${room.id}: bad side`);
          assert.ok(win.u0 >= s0 + 1.4 && win.u1 <= s1 - 1.4, `${room.id}: window outside wall span`);
          assert.ok(win.u1 - win.u0 >= 1.8, `${room.id}: window too narrow`);
          assert.ok(win.y0 >= 0.9 && win.y1 > win.y0, `${room.id}: bad window height`);
          assert.ok(win.y1 <= room.height - 0.6, `${room.id}: window punches the ceiling`);
          assert.ok(/^#[0-9a-f]{6}$/i.test(win.color), `${room.id}: bad window color`);
          // Never on a decorated side, never over a doorway.
          const decor = room.features.decor;
          assert.notEqual(decor.niches, win.side);
          assert.notEqual(decor.lifebuoys, win.side);
          assert.notEqual(decor.windows, win.side);
          assert.notEqual(decor.slopedCeiling, win.side);
          for (const door of room.doors) {
            if (door.side !== win.side) continue;
            assert.ok(win.u1 + 0.2 < door.u0 || win.u0 - 0.2 > door.u1, `${room.id}: window over door`);
          }
          // No overlapping windows on the same side.
          for (const other of wins) {
            if (other === win || other.side !== win.side) continue;
            assert.ok(win.u1 + 0.3 < other.u0 || win.u0 - 0.3 > other.u1, `${room.id}: overlapping windows`);
          }
        }
      }
    }
  }
  assert.ok(total >= 10, `procedural windows too rare: ${total}`);
});

test('light specs carry kind, priority and finite positions', () => {
  const kinds = new Set();
  for (const seed of [1, 7, 99]) {
    for (const floor of allFloors(generateLevel({ seed, roomCount: 7 }))) {
      assert.ok(floor.lights.length > floor.rooms.length, `floor ${floor.index}: no per-room lighting variety`);
      let ceilingLights = 0;
      for (const light of floor.lights) {
        kinds.add(light.kind);
        assert.ok(light.priority > 0 && light.priority <= 1, `bad priority ${light.priority}`);
        assert.ok(Number.isFinite(light.position[0]) && Number.isFinite(light.position[1]) && Number.isFinite(light.position[2]), 'NaN light position');
        assert.ok(light.intensity > 0 && light.distance > 0, 'degenerate light');
        if (light.flicker) {
          assert.ok(light.flicker.speed > 0 && light.flicker.depth > 0 && light.flicker.depth < 1);
          assert.ok(Number.isFinite(light.flicker.phase));
        }
        if (light.kind === 'ceiling') ceilingLights += 1;
      }
      assert.equal(ceilingLights, floor.rooms.length, 'every room needs exactly one ceiling light');
      // Fixtures have geometry descriptors for the builder.
      for (const room of floor.rooms) {
        const fixtures = room.features.decor.lightFixtures ?? [];
        assert.ok(fixtures.length >= 1, `${room.id}: no fixtures`);
        for (const fixture of fixtures) {
          assert.ok(fixture.shape === 'panel' || fixture.shape === 'strip');
          assert.ok(fixture.x > room.rect.x0 && fixture.x < room.rect.x1, 'fixture outside room (x)');
          assert.ok(fixture.z > room.rect.z0 && fixture.z < room.rect.z1, 'fixture outside room (z)');
          assert.ok(Math.abs(fixture.y - room.height) < 0.5, 'fixture not near ceiling');
          assert.ok(/^#[0-9a-f]{6}$/i.test(fixture.color));
        }
      }
    }
  }
  for (const kind of ['ceiling', 'fixture', 'pool', 'window', 'corridor']) {
    assert.ok(kinds.has(kind), `light kind ${kind} never generated`);
  }
});

test('every basin can be climbed out: submerged steps or a monumental stair', () => {
  for (const seed of [1, 7, 99, 1234, 55555]) {
    for (const floor of allFloors(generateLevel({ seed, roomCount: 7 }))) {
      for (const room of floor.rooms) {
        for (const basin of room.features.basins) {
          const byRun = room.features.stairRuns.some((run) => intersects(run.rect, basin.rect));
          assert.ok(basin.stairs || byRun, `${room.id}: basin with no way out`);
          if (!basin.stairs) continue;
          const { side, count, rise } = basin.stairs;
          assert.ok(count >= 2 && rise > 0 && basin.stairs.run > 0, `${room.id}: bad steps`);
          assert.ok(count * rise >= basin.depth - 0.5, `${room.id}: steps too short for depth`);
          // Steps must not hide behind an island that hugs the same wall.
          const blocked = room.features.islands.some((isl) => (side === 'W' && isl.x0 <= room.rect.x0 + 0.01)
            || (side === 'E' && isl.x1 >= room.rect.x1 - 0.01)
            || (side === 'N' && isl.z0 <= room.rect.z0 + 0.01)
            || (side === 'S' && isl.z1 >= room.rect.z1 - 0.01));
          assert.equal(blocked, false, `${room.id}: steps behind an island`);
        }
      }
    }
  }
});
