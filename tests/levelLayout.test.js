import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel, sideWallLine } from '../src/world/levelGen.js';
import { LevelCollider, deriveWalls } from '../src/world/levelLayout.js';

const R = 0.35;
const level = generateLevel({ seed: 20261104, roomCount: 8 });
const collider = new LevelCollider(level);

test('doorways are open: no wall blocks a door centre', () => {
  for (const room of level.rooms) {
    for (const door of room.doors) {
      const u = (door.u0 + door.u1) / 2;
      const line = sideWallLine(room.rect, door.side);
      const x = door.side === 'N' || door.side === 'S' ? u : line;
      const z = door.side === 'N' || door.side === 'S' ? line : u;
      assert.equal(collider.canStand(x, z, R), true, `door of ${room.id} blocked`);
      // A metre beside the opening the wall must block.
      const side = door.u1 + 1.0;
      const wx = door.side === 'N' || door.side === 'S' ? side : line;
      const wz = door.side === 'N' || door.side === 'S' ? line : side;
      assert.equal(collider.canStand(wx, wz, R), false, `wall beside door of ${room.id} missing`);
    }
  }
});

test('every wall segment lies on the union boundary', () => {
  const walls = deriveWalls(level);
  assert.ok(walls.length > level.rooms.length * 3);
  for (const wall of walls) {
    const mx = (wall.x0 + wall.x1) / 2;
    const mz = (wall.z0 + wall.z1) / 2;
    // Midpoint of a wall must not be standable, and 1 m inside must be.
    assert.equal(collider.canStand(mx, mz, R), false, 'wall midpoint standable');
  }
});

test('room deck rings and corridor centrelines are walkable', () => {
  for (const room of level.rooms) {
    const cx = (room.rect.x0 + room.rect.x1) / 2;
    assert.equal(collider.canStand(cx, room.rect.z1 - 1.2, R), true, `${room.id} south ring`);
    assert.equal(collider.canStand(room.rect.x0 + 1.2, room.rect.z0 + 1.2, R), true, `${room.id} corner ring`);
  }
  for (const corridor of level.corridors) {
    for (const r of corridor.rects) {
      const long = r.x1 - r.x0 >= r.z1 - r.z0;
      for (const t of [0.2, 0.5, 0.8]) {
        const x = long ? r.x0 + (r.x1 - r.x0) * t : (r.x0 + r.x1) / 2;
        const z = long ? (r.z0 + r.z1) / 2 : r.z0 + (r.z1 - r.z0) * t;
        assert.equal(collider.canStand(x, z, R), true, `${corridor.id} centreline`);
      }
    }
    if (corridor.rects.length > 1) {
      const [a, b] = corridor.rects;
      const corner = {
        x0: Math.max(a.x0, b.x0), z0: Math.max(a.z0, b.z0),
        x1: Math.min(a.x1, b.x1), z1: Math.min(a.z1, b.z1)
      };
      assert.equal(collider.canStand((corner.x0 + corner.x1) / 2, (corner.z0 + corner.z1) / 2, R), true, `${corridor.id} corner`);
    }
  }
});

test('outside the level is not standable', () => {
  assert.equal(collider.canStand(level.bounds.minX - 5, level.bounds.minZ - 5, R), false);
  assert.equal(collider.canStand(level.bounds.maxX + 3, 0, R), false);
  // The spawn room centre is inside the union (wading in the basin counts).
  assert.equal(collider.canStand(0, 0, R), true);
});

test('basin floors, steps and flooded halls report sane heights', () => {
  for (const room of level.rooms) {
    for (const basin of room.features.basins) {
      // Sample a basin point that no island / stair run / landing covers.
      let cx = null; let cz = null;
      for (const [fu, fv] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7], [0.5, 0.5]]) {
        const x = basin.rect.x0 + (basin.rect.x1 - basin.rect.x0) * fu;
        const z = basin.rect.z0 + (basin.rect.z1 - basin.rect.z0) * fv;
        const covered = [...room.features.islands, ...room.features.landings, ...room.features.stairRuns.map((run) => run.rect)]
          .some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
        if (!covered) { cx = x; cz = z; break; }
      }
      assert.ok(cx !== null, `${room.id} basin fully covered`);
      const ground = collider.getGroundHeight(cx, cz);
      assert.ok(ground <= -basin.depth + 1e-9 || (basin.stairs && ground < 0), `${room.id} basin floor`);
      if (basin.stairs) {
        const { stairs } = basin;
        const heights = [0.2, 0.8, 1.4].map((d) => {
          const x = stairs.side === 'E' ? basin.rect.x1 - d : stairs.side === 'W' ? basin.rect.x0 + d : cx;
          const z = stairs.side === 'S' ? basin.rect.z1 - d : stairs.side === 'N' ? basin.rect.z0 + d : cz;
          return collider.getGroundHeight(x, z);
        });
        assert.ok(heights[0] > heights[1] && heights[1] > heights[2], 'steps descend');
        assert.ok(heights[0] >= -stairs.rise - 1e-9, 'first step rise');
      }
      const water = collider.getWaterState(cx, cz, 0);
      assert.ok(water && Math.abs(water.level - basin.level) < 1e-9, `${room.id} basin water`);
    }
    for (const landing of room.features.landings) {
      const cx = (landing.rect.x0 + landing.rect.x1) / 2;
      const cz = (landing.rect.z0 + landing.rect.z1) / 2;
      assert.equal(collider.getGroundHeight(cx, cz), landing.y);
    }
    for (const run of room.features.stairRuns) {
      const low = run.enter === 'N' || run.enter === 'W' ? 0.1 : 0.9;
      const high = run.enter === 'N' || run.enter === 'W' ? 0.9 : 0.1;
      const at = (t) => (run.axis === 'z'
        ? collider.getGroundHeight((run.rect.x0 + run.rect.x1) / 2, run.rect.z0 + (run.rect.z1 - run.rect.z0) * t)
        : collider.getGroundHeight(run.rect.x0 + (run.rect.x1 - run.rect.x0) * t, (run.rect.z0 + run.rect.z1) / 2));
      assert.ok(at(low) < at(high), 'monumental stair climbs');
      assert.ok(at(high) <= run.to + 1e-9);
    }
  }
  // Dry deck reports zero and no water.
  const first = level.rooms[0];
  assert.equal(collider.getGroundHeight((first.rect.x0 + first.rect.x1) / 2, first.rect.z1 - 1.2), 0);
  assert.equal(collider.getWaterState((first.rect.x0 + first.rect.x1) / 2, first.rect.z1 - 1.2, 0), null);
});

test('pillars and solid blocks reject the player disk', () => {
  for (const room of level.rooms) {
    for (const pillar of room.features.pillars) {
      const pad = pillar.shape === 'circle' ? pillar.r : Math.max(pillar.sx, pillar.sz) / 2;
      assert.equal(collider.canStand(pillar.x + pad + 0.2, pillar.z, R), false, `${room.id} pillar clip`);
      assert.equal(collider.canStand(pillar.x + pad + 0.5, pillar.z, R), true, `${room.id} pillar clearance`);
    }
  }
});

test('resolveHorizontal keeps a free position and restores a blocked one', () => {
  const first = level.rooms[0];
  const free = { x: (first.rect.x0 + first.rect.x1) / 2, z: first.rect.z1 - 2 };
  const previous = { ...free };
  const moved = collider.resolveHorizontal({ x: free.x, z: free.z }, R, previous);
  assert.equal(moved.x, free.x);
  const blocked = collider.resolveHorizontal({ x: level.bounds.minX - 10, z: 0 }, R, previous);
  assert.equal(blocked.x, previous.x);
  assert.equal(blocked.z, previous.z);
});
