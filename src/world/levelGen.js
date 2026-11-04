/**
 * Procedural Level 37 (Poolrooms) layout generator.
 *
 * Pure data module (no Three.js). A level is now a stack of floors
 * (main hall level, an upper floor and a sublevel) plus:
 *  - horizontal corridors (3 archetypes) joining rooms on the same floor,
 *  - loop closures (rings in the graph),
 *  - dive tunnels: fully flooded pipes joining two basins UNDER the deck,
 *    swim-through only ("кольца, уходящие под воду"),
 *  - vertical connectors between stairwell rooms on neighbouring floors
 *    ("кольца, уходящие вверх на другие этажи").
 *
 * Every footprint is an axis-aligned rect; walk corridors overlap their end
 * rooms by SEAM so the union of footprints is one connected walkable region.
 * Wall segments are derived later by levelLayout.js by clipping each rect
 * edge against the interiors of the other rects and against door openings.
 * Dive tunnels are marked noClip: they pass under decks and room walls, so
 * they never cut room walls and never add walls inside rooms.
 *
 * Room archetypes (from the reference photos):
 *  - poolHall   : classic basin with submerged steps, corner pillars,
 *                 lamp niches and lifebuoy panels            (refs 1, 7)
 *  - colonnade  : grid of round pillars standing in water,
 *                 deck peninsula with handrails              (refs 9, 10)
 *  - rotunda    : flooded floor, central column, ceiling oculus,
 *                 glowing window panels                      (ref 3)
 *  - grandStair : flooded hall, monumental stair climbing out of
 *                 the water to a raised landing, square pillars (ref 4)
 *  - lanePool   : basin split by a tiled walkway bridge, sloped ribbed
 *                 ceiling and a stepped wall of lit windows   (ref 5)
 *  - stairwell  : small tiled tower room; becomes a stair up, a floor
 *                 hatch down, or a mini pool when unpaired
 *
 * Corridor archetypes:
 *  - archVault  : flooded vaulted tunnel with arch ribs       (ref 2)
 *  - darkChannel: narrow dim passage, shallow side channel,
 *                 light shafts and a pillar row               (ref 6)
 *  - scallop    : undulating (scalloped) walls, water channel (ref 8)
 *  - dive       : submerged pipe between two basins (swim through)
 */
import { Rng } from './rng.js';

export const GEN_CONFIG = Object.freeze({
  corridorWidth: 3.2,
  corridorHeight: 3.4,
  seam: 0.9, // how deep a corridor rect reaches into its end rooms
  roomGap: 2.2, // minimum free space kept between unrelated footprints
  doorCornerMargin: 2.6, // doors stay this far from room corners
  doorGap: 1.6, // minimum space between two doors on the same wall
  channelDryEdge: 1.6, // dry deck between a corridor channel and a doorway
  diveWidth: 2.2, // swim-through tunnel width
  diveCeiling: -0.35, // tunnel top stays below every basin water line
  floorGap: 9 // vertical distance between floor slabs
});

export const ROOM_TYPES = ['poolHall', 'colonnade', 'rotunda', 'grandStair', 'lanePool'];
export const CORRIDOR_TYPES = ['archVault', 'darkChannel', 'scallop'];
export const ROOM_HEIGHTS = { poolHall: 6.5, colonnade: 7.4, rotunda: 6.2, grandStair: 7.0, lanePool: 6.0, stairwell: 5.2 };
export const ROOM_LIGHT_COLORS = { poolHall: '#bff3ff', colonnade: '#c9ffe9', rotunda: '#d8fbff', grandStair: '#ffeccb', lanePool: '#c4f6ff', stairwell: '#d9f4ff' };

/* ------------------------------------------------------------------ rects */

export const rect = (x0, z0, x1, z1) => ({ x0, z0, x1, z1 });
export const inflate = (r, m) => rect(r.x0 - m, r.z0 - m, r.x1 + m, r.z1 + m);
export const intersects = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
export const inside = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
const center = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];

/** Sides: N = -z wall, S = +z wall, W = -x wall, E = +x wall. u runs along the wall. */
export const SIDES = Object.freeze(['N', 'S', 'E', 'W']);
export const OPPOSITE = Object.freeze({ N: 'S', S: 'N', E: 'W', W: 'E' });

/** Which end of a corridor rect overlaps the room it plugs into. */
const SEAM_END = Object.freeze({ N: 'zmax', S: 'zmin', E: 'xmin', W: 'xmax' });

export function sideWallLine(r, side) {
  if (side === 'N') return r.z0;
  if (side === 'S') return r.z1;
  if (side === 'W') return r.x0;
  return r.x1;
}

export function sideSpan(r, side) {
  return side === 'N' || side === 'S' ? [r.x0, r.x1] : [r.z0, r.z1];
}

function doorProbe(room, side, u0, u1, depth) {
  if (side === 'N') return rect(u0, room.rect.z0, u1, room.rect.z0 + depth);
  if (side === 'S') return rect(u0, room.rect.z1 - depth, u1, room.rect.z1);
  if (side === 'W') return rect(room.rect.x0, u0, room.rect.x0 + depth, u1);
  return rect(room.rect.x1 - depth, u0, room.rect.x1, u1);
}

/* ------------------------------------------------------- room feature kits */

function insetAsym(r, rng, minMargin, jitter) {
  return rect(
    r.x0 + minMargin + rng.range(0, jitter),
    r.z0 + minMargin + rng.range(0, jitter),
    r.x1 - minMargin - rng.range(0, jitter),
    r.z1 - minMargin - rng.range(0, jitter)
  );
}

/** Floor drains and wall pipes give every basin industrial variety. */
function basinDrains(basinRect, rng) {
  const drains = [];
  const count = rng.int(2, 4);
  for (let i = 0; i < count; i += 1) {
    drains.push({
      x: rng.range(basinRect.x0 + 1.2, basinRect.x1 - 1.2),
      z: rng.range(basinRect.z0 + 1.2, basinRect.z1 - 1.2),
      r: rng.range(0.35, 0.6)
    });
  }
  return drains;
}

function makeFeatures(type, r, rng) {
  const f = { basins: [], islands: [], landings: [], stairRuns: [], pillars: [], holes: [], decor: { pipes: {} } };
  const w = r.x1 - r.x0;
  const h = r.z1 - r.z0;
  f.decor.pipes.risers = rng.chance(0.7) ? rng.int(1, 3) : 0;

  if (type === 'poolHall') {
    const basin = insetAsym(r, rng, 3.2, 1.4);
    f.basins.push({ rect: basin, depth: 1.8, level: -0.3, mouths: [], drains: basinDrains(basin, rng), stairs: { side: rng.pick(SIDES), count: 3, rise: 0.45, run: 0.55 } });
    const corners = [
      [basin.x0 - 1.3, basin.z0 - 1.3], [basin.x1 + 1.3, basin.z0 - 1.3],
      [basin.x0 - 1.3, basin.z1 + 1.3], [basin.x1 + 1.3, basin.z1 + 1.3]
    ];
    for (const [x, z] of rng.shuffle(corners).slice(0, rng.int(2, 4))) {
      if (x > r.x0 + 1.1 && x < r.x1 - 1.1 && z > r.z0 + 1.1 && z < r.z1 - 1.1) {
        f.pillars.push({ shape: 'circle', x, z, r: 0.55 });
      }
    }
    f.decor.niches = rng.pick(SIDES);
    f.decor.lifebuoys = rng.chance(0.75) ? rng.pick(SIDES) : null;
    const railSides = rng.shuffle(SIDES.filter((side) => side !== f.basins[0].stairs.side)).slice(0, rng.int(1, 2));
    f.decor.handrails = railSides;
    f.decor.ceilingStrip = true;
    f.decor.pipes.inflow = rng.chance(0.6) ? { side: rng.pick(SIDES), u: rng.range(0.3, 0.7) } : null;
  }

  if (type === 'colonnade') {
    const basin = insetAsym(r, rng, 2.8, 1.2);
    f.basins.push({ rect: basin, depth: 1.5, level: -0.25, mouths: [], drains: basinDrains(basin, rng), stairs: null });
    const cols = rng.int(2, 3);
    const rows = rng.int(3, 4);
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const x = basin.x0 + ((i + 0.5) / cols) * (basin.x1 - basin.x0) + rng.range(-0.6, 0.6);
        const z = basin.z0 + ((j + 0.5) / rows) * (basin.z1 - basin.z0) + rng.range(-0.6, 0.6);
        f.pillars.push({ shape: 'circle', x, z, r: rng.range(0.5, 0.72) });
      }
    }
    const side = rng.pick(SIDES);
    const reach = rng.range(0.4, 0.55);
    const width = rng.range(2.6, 3.4);
    const u = (side === 'N' || side === 'S') ? r.x0 + w * rng.range(0.35, 0.65) : r.z0 + h * rng.range(0.35, 0.65);
    if (side === 'N') f.islands.push(rect(u - width / 2, r.z0, u + width / 2, basin.z0 + (basin.z1 - basin.z0) * reach));
    if (side === 'S') f.islands.push(rect(u - width / 2, basin.z1 - (basin.z1 - basin.z0) * reach, u + width / 2, r.z1));
    if (side === 'W') f.islands.push(rect(r.x0, u - width / 2, basin.x0 + (basin.x1 - basin.x0) * reach, u + width / 2));
    if (side === 'E') f.islands.push(rect(basin.x1 - (basin.x1 - basin.x0) * reach, u - width / 2, r.x1, u + width / 2));
    f.decor.handrails = [OPPOSITE[side]];
    f.decor.lifebuoys = rng.chance(0.5) ? rng.pick(SIDES) : null;
    f.decor.pipes.inflow = rng.chance(0.5) ? { side: rng.pick(SIDES), u: rng.range(0.3, 0.7) } : null;
  }

  if (type === 'rotunda') {
    const basin = insetAsym(r, rng, 2.5, 0.6);
    f.basins.push({ rect: basin, depth: 0.85, level: -0.14, mouths: [], drains: basinDrains(basin, rng), stairs: null });
    const [cx, cz] = center(r);
    f.pillars.push({ shape: 'circle', x: cx, z: cz, r: rng.range(0.85, 1.15) });
    f.decor.oculus = true;
    f.decor.windows = rng.pick(SIDES);
  }

  if (type === 'grandStair') {
    const deckSide = rng.pick(SIDES);
    const m = 2.6;
    const strip = 4.2;
    const basin = rect(
      r.x0 + m + (deckSide === 'W' ? strip : 0),
      r.z0 + m + (deckSide === 'N' ? strip : 0),
      r.x1 - m - (deckSide === 'E' ? strip : 0),
      r.z1 - m - (deckSide === 'S' ? strip : 0)
    );
    f.basins.push({ rect: basin, depth: 1.0, level: -0.22, mouths: [], drains: basinDrains(basin, rng), stairs: null });
    const stairSide = OPPOSITE[deckSide];
    const runLength = 3.6;
    const stairWidth = Math.min(w, h) * rng.range(0.4, 0.55);
    const u = (stairSide === 'N' || stairSide === 'S') ? r.x0 + w * rng.range(0.4, 0.6) : r.z0 + h * rng.range(0.4, 0.6);
    let run; let landing;
    if (stairSide === 'N' || stairSide === 'S') {
      const z0 = stairSide === 'N' ? basin.z0 : basin.z1 - runLength;
      run = rect(u - stairWidth / 2, z0, u + stairWidth / 2, z0 + runLength);
      const lz = stairSide === 'N' ? r.z0 + 0.4 : r.z1 - 2.9;
      landing = rect(run.x0 - 0.8, lz, run.x1 + 0.8, lz + 2.5);
    } else {
      const x0 = stairSide === 'W' ? basin.x0 : basin.x1 - runLength;
      run = rect(x0, u - stairWidth / 2, x0 + runLength, u + stairWidth / 2);
      const lx = stairSide === 'W' ? r.x0 + 0.4 : r.x1 - 2.9;
      landing = rect(lx, run.z0 - 0.8, lx + 2.5, run.z1 + 0.8);
    }
    f.stairRuns.push({ rect: run, axis: stairSide === 'N' || stairSide === 'S' ? 'z' : 'x', from: -1.0, to: 0.95, steps: 6, enter: stairSide });
    f.landings.push({ rect: landing, y: 0.95 });
    const grid = rng.int(2, 3);
    for (let i = 0; i < grid; i += 1) {
      const x = basin.x0 + ((i + 0.5) / grid) * (basin.x1 - basin.x0) + rng.range(-0.8, 0.8);
      const z = rng.range(basin.z0 + 1.5, basin.z1 - 1.5);
      if (!intersects(rect(x - 0.6, z - 0.6, x + 0.6, z + 0.6), run)) {
        f.pillars.push({ shape: 'rect', x, z, sx: 0.75, sz: 0.75 });
      }
    }
    f.decor.beams = true;
  }

  if (type === 'lanePool') {
    const basin = insetAsym(r, rng, 2.8, 1.0);
    f.basins.push({ rect: basin, depth: 1.6, level: -0.3, mouths: [], drains: basinDrains(basin, rng), stairs: null });
    if (w >= h) {
      const u = r.z0 + h * rng.range(0.42, 0.58);
      f.islands.push(rect(r.x0, u - 1.2, r.x1, u + 1.2));
    } else {
      const u = r.x0 + w * rng.range(0.42, 0.58);
      f.islands.push(rect(u - 1.2, r.z0, u + 1.2, r.z1));
    }
    f.decor.slopedCeiling = rng.pick(SIDES);
    f.decor.windows = f.decor.slopedCeiling;
    f.decor.pipes.inflow = rng.chance(0.5) ? { side: rng.pick(SIDES), u: rng.range(0.3, 0.7) } : null;
  }

  if (type === 'stairwell') {
    // Filled in later by placeStairwell() once pairing is known.
    f.stairwell = null;
  }

  return f;
}

/** Stairwell tower rooms: stair up to a hatch, floor hatch down, or mini pool. */
export function placeStairwell(room, variant, rng) {
  const r = room.rect;
  const f = room.features;
  f.stairwell = { variant };
  if (variant === 'pool') {
    const basin = insetAsym(r, rng, 2.4, 0.6);
    f.basins.push({ rect: basin, depth: 1.3, level: -0.25, mouths: [], drains: basinDrains(basin, rng), stairs: { side: rng.pick(SIDES), count: 2, rise: 0.45, run: 0.5 } });
    return;
  }
  if (variant === 'up') {
    for (const side of rng.shuffle([...SIDES])) {
      const along = side === 'N' || side === 'S' ? [r.x0, r.x1] : [r.z0, r.z1];
      const width = Math.min(3.4, (along[1] - along[0]) * 0.5);
      const u = (along[0] + along[1]) / 2;
      const landingDepth = 1.8;
      const runLength = 3.2;
      let landingRect; let runRect; let axis;
      if (side === 'N') { landingRect = rect(u - width / 2, r.z0 + 0.3, u + width / 2, r.z0 + 0.3 + landingDepth); runRect = rect(u - width / 2, landingRect.z1, u + width / 2, landingRect.z1 + runLength); axis = 'z'; }
      else if (side === 'S') { landingRect = rect(u - width / 2, r.z1 - 0.3 - landingDepth, u + width / 2, r.z1 - 0.3); runRect = rect(u - width / 2, landingRect.z0 - runLength, u + width / 2, landingRect.z0); axis = 'z'; }
      else if (side === 'W') { landingRect = rect(r.x0 + 0.3, u - width / 2, r.x0 + 0.3 + landingDepth, u + width / 2); runRect = rect(landingRect.x1, u - width / 2, landingRect.x1 + runLength, u + width / 2); axis = 'x'; }
      else { landingRect = rect(r.x1 - 0.3 - landingDepth, u - width / 2, r.x1 - 0.3, u + width / 2); runRect = rect(landingRect.x0 - runLength, u - width / 2, landingRect.x0, u + width / 2); axis = 'x'; }
      const blocked = [...f.basins, ...f.islands].some((b) => intersects(runRect, b.rect) || intersects(landingRect, b.rect))
        || room.doors.some((door) => intersects(doorProbe(room, door.side, door.u0, door.u1, 2.2), runRect) || intersects(doorProbe(room, door.side, door.u0, door.u1, 2.2), landingRect));
      if (blocked) continue;
      f.stairRuns.push({ rect: runRect, axis, from: 0, to: 2.6, steps: 7, enter: OPPOSITE[side] });
      f.landings.push({ rect: landingRect, y: 2.6 });
      f.stairwell = { variant, side, zone: landingRect, hatch: landingRect };
      return;
    }
    f.stairwell = { variant: 'pool' };
    const basin = insetAsym(r, rng, 2.4, 0.6);
    f.basins.push({ rect: basin, depth: 1.3, level: -0.25, mouths: [], drains: basinDrains(basin, rng), stairs: null });
    return;
  }
  // variant 'down': a hatch hole in the middle of the deck.
  const size = 2.4;
  const [cx, cz] = center(r);
  const hole = rect(cx - size / 2, cz - size / 2, cx + size / 2, cz + size / 2);
  const blocked = room.doors.some((door) => intersects(doorProbe(room, door.side, door.u0, door.u1, 2.4), hole));
  if (blocked) {
    f.stairwell = { variant: 'pool' };
    const basin = insetAsym(r, rng, 2.4, 0.6);
    f.basins.push({ rect: basin, depth: 1.3, level: -0.25, mouths: [], drains: basinDrains(basin, rng), stairs: null });
    return;
  }
  f.holes.push({ rect: hole, depth: 8 });
  f.stairwell = { variant, zone: inflate(hole, 0.15), hole };
}

/* -------------------------------------------------------------- door logic */

function pillarRect(pillar, pad = 0) {
  return pillar.shape === 'circle'
    ? rect(pillar.x - pillar.r - pad, pillar.z - pillar.r - pad, pillar.x + pillar.r + pad, pillar.z + pillar.r + pad)
    : rect(pillar.x - pillar.sx / 2 - pad, pillar.z - pillar.sz / 2 - pad, pillar.x + pillar.sx / 2 + pad, pillar.z + pillar.sz / 2 + pad);
}

/** A door must open onto dry, obstacle-free deck. Pass `ignoreCorridorId`
 *  to re-validate an already registered door without matching itself. */
export function doorBlocked(room, side, u0, u1, ignoreCorridorId = null) {
  const probe = doorProbe(room, side, u0 - 0.4, u1 + 0.4, 2.2);
  const f = room.features;
  for (const basin of f.basins) if (intersects(probe, basin.rect)) return true;
  for (const run of f.stairRuns) if (intersects(probe, run.rect)) return true;
  for (const landing of f.landings) if (intersects(probe, landing.rect)) return true;
  for (const hole of f.holes) if (intersects(probe, inflate(hole.rect, 0.6))) return true;
  for (const island of f.islands) {
    if (!intersects(probe, island)) continue;
    const wide = side === 'N' || side === 'S' ? island.x1 - island.x0 : island.z1 - island.z0;
    if (wide < u1 - u0 + 0.8) return true;
  }
  for (const pillar of f.pillars) if (intersects(probe, pillarRect(pillar, 0.4))) return true;
  for (const door of room.doors) {
    if (door.side !== side || door.corridorId === ignoreCorridorId) continue;
    if (u0 < door.u1 + GEN_CONFIG.doorGap && door.u0 < u1 + GEN_CONFIG.doorGap) return true;
  }
  const [s0, s1] = sideSpan(room.rect, side);
  return u0 - s0 < GEN_CONFIG.doorCornerMargin || s1 - u1 < GEN_CONFIG.doorCornerMargin;
}

/* ----------------------------------------------------------- floor builder */

function makeFloor(rng, floorIndex, roomCount) {
  const W = GEN_CONFIG.corridorWidth;
  const seam = GEN_CONFIG.seam;
  const rooms = [];
  const corridors = [];
  let roomSeq = 0;

  const footprints = () => [
    ...rooms.map((room) => ({ owner: room.id, rect: room.rect, kind: 'room' })),
    ...corridors.filter((c) => c.kind !== 'dive').flatMap((corridor) => corridor.rects.map((r, i) => ({ owner: `${corridor.id}#${i}`, rect: r, kind: 'corridor' })))
  ];
  const conflicts = (candidate, allowedOwners) => footprints().some((entry) => {
    if (allowedOwners.includes(entry.owner)) return false;
    const gap = entry.kind === 'room' ? GEN_CONFIG.roomGap : 0.7;
    return intersects(inflate(candidate, gap), entry.rect);
  });

  const addRoom = (type, r, features = makeFeatures(type, r, rng)) => {
    const room = {
      id: `f${floorIndex}-room-${roomSeq}`, index: roomSeq, type, rect: r,
      height: ROOM_HEIGHTS[type], doors: [], features
    };
    roomSeq += 1;
    rooms.push(room);
    return room;
  };

  const first = addRoom('poolHall', rect(-11, -9.5, 11, 9.5));

  const carveCorridorRects = (fromRoom, side, doorCenter, length, turn, length2) => {
    const half = W / 2;
    const wall = sideWallLine(fromRoom.rect, side);
    let rectA;
    if (side === 'N') rectA = rect(doorCenter - half, wall - length, doorCenter + half, wall + seam);
    else if (side === 'S') rectA = rect(doorCenter - half, wall - seam, doorCenter + half, wall + length);
    else if (side === 'W') rectA = rect(wall - length, doorCenter - half, wall + seam, doorCenter + half);
    else rectA = rect(wall - seam, doorCenter - half, wall + length, doorCenter + half);

    const allowed = [fromRoom.id];
    if (conflicts(rectA, allowed)) return null;

    const rects = [rectA];
    let endSide = OPPOSITE[side];
    let endRect = rectA;
    if (turn) {
      let corner;
      if (side === 'N') corner = rect(rectA.x0, rectA.z0, rectA.x1, rectA.z0 + W);
      else if (side === 'S') corner = rect(rectA.x0, rectA.z1 - W, rectA.x1, rectA.z1);
      else if (side === 'W') corner = rect(rectA.x0, rectA.z0, rectA.x0 + W, rectA.z1);
      else corner = rect(rectA.x1 - W, rectA.z0, rectA.x1, rectA.z1);
      const inset = 1.1;
      if (turn === 'E') { endRect = rect(corner.x1 - inset, corner.z0, corner.x1 - inset + length2, corner.z1); endSide = 'W'; }
      if (turn === 'W') { endRect = rect(corner.x0 + inset - length2, corner.z0, corner.x0 + inset, corner.z1); endSide = 'E'; }
      if (turn === 'S') { endRect = rect(corner.x0, corner.z1 - inset, corner.x1, corner.z1 - inset + length2); endSide = 'N'; }
      if (turn === 'N') { endRect = rect(corner.x0, corner.z0 + inset - length2, corner.x1, corner.z0 + inset); endSide = 'S'; }
      if (conflicts(endRect, allowed)) return null;
      rects.push(endRect);
    }
    return { rects, endSide, endRect };
  };

  const placeNewRoom = (endRect, endSide) => {
    const rw = rng.range(14, 26);
    const rh = rng.range(13, 22);
    const [cu, cv] = center(endRect);
    if (endSide === 'W') return rect(endRect.x1 - seam, cv - rh / 2, endRect.x1 - seam + rw, cv + rh / 2);
    if (endSide === 'E') return rect(endRect.x0 + seam - rw, cv - rh / 2, endRect.x0 + seam, cv + rh / 2);
    if (endSide === 'N') return rect(cu - rw / 2, endRect.z1 - seam, cu + rw / 2, endRect.z1 - seam + rh);
    return rect(cu - rw / 2, endRect.z0 + seam - rh, cu + rw / 2, endRect.z0 + seam);
  };

  const growRoom = (forceType = null) => {
    for (const source of rng.shuffle(rooms.slice(-5))) {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const side = rng.pick(SIDES);
        const [s0, s1] = sideSpan(source.rect, side);
        if (s1 - s0 < W + 2 * GEN_CONFIG.doorCornerMargin) continue;
        const doorU0 = rng.range(s0 + GEN_CONFIG.doorCornerMargin, s1 - GEN_CONFIG.doorCornerMargin - W);
        const doorU1 = doorU0 + W;
        if (doorBlocked(source, side, doorU0, doorU1)) continue;

        const length = rng.range(6, 13);
        const perpendicular = (side === 'N' || side === 'S') ? ['E', 'W'] : ['N', 'S'];
        const turn = rng.chance(0.45) ? rng.pick(perpendicular) : null;
        const length2 = turn ? rng.range(6, 11) : 0;

        const carved = carveCorridorRects(source, side, (doorU0 + doorU1) / 2, length, turn, length2);
        if (!carved) continue;
        const type = forceType ?? rng.pick(ROOM_TYPES);
        const newRect = forceType === 'stairwell'
          ? (() => {
            const size = rng.range(9, 11.5);
            const [cu, cv] = center(carved.endRect);
            if (carved.endSide === 'W') return rect(carved.endRect.x1 - seam, cv - size / 2, carved.endRect.x1 - seam + size, cv + size / 2);
            if (carved.endSide === 'E') return rect(carved.endRect.x0 + seam - size, cv - size / 2, carved.endRect.x0 + seam, cv + size / 2);
            if (carved.endSide === 'N') return rect(cu - size / 2, carved.endRect.z1 - seam, cu + size / 2, carved.endRect.z1 - seam + size);
            return rect(cu - size / 2, carved.endRect.z0 + seam - size, cu + size / 2, carved.endRect.z0 + seam);
          })()
          : placeNewRoom(carved.endRect, carved.endSide);
        const doorSpan = carved.endSide === 'N' || carved.endSide === 'S'
          ? [carved.endRect.x0, carved.endRect.x1]
          : [carved.endRect.z0, carved.endRect.z1];
        const candidate = { id: `f${floorIndex}-room-${roomSeq}`, index: roomSeq, type, rect: newRect, doors: [], features: makeFeatures(type, newRect, rng), height: ROOM_HEIGHTS[type] };
        if (doorBlocked(candidate, carved.endSide, doorSpan[0], doorSpan[1])) continue;
        if (!intersects(newRect, carved.endRect)) continue;
        if (footprints().some((entry) => !(entry.kind === 'corridor' && carved.rects.includes(entry.rect))
          && intersects(inflate(newRect, GEN_CONFIG.roomGap), entry.rect))) continue;

        rooms.push(candidate);
        roomSeq += 1;
        const room = candidate;
        const corridor = {
          id: `f${floorIndex}-corridor-${corridors.length}`,
          kind: 'walk',
          type: rng.pick(CORRIDOR_TYPES),
          rects: carved.rects,
          from: source.id, fromSide: side,
          to: room.id, toSide: carved.endSide,
          width: W, height: GEN_CONFIG.corridorHeight, water: [], pillars: []
        };
        source.doors.push({ side, u0: doorU0, u1: doorU1, corridorId: corridor.id, height: GEN_CONFIG.corridorHeight });
        room.doors.push({ side: carved.endSide, u0: doorSpan[0], u1: doorSpan[1], corridorId: corridor.id, height: GEN_CONFIG.corridorHeight });
        corridors.push(corridor);
        return true;
      }
    }
    return false;
  };

  let guard = 0;
  while (rooms.length < roomCount && guard < 500) {
    guard += 1;
    if (!growRoom()) break;
  }
  // One stairwell tower per floor so vertical loops always have an anchor.
  growRoom('stairwell');

  // Loop closures (rings in the graph).
  const maxLoops = roomCount >= 7 ? 3 : 2;
  for (let loop = 0; loop < maxLoops; loop += 1) {
    const a = rng.pick(rooms);
    const b = rng.pick(rooms);
    if (a === b) continue;
    if (corridors.some((c) => (c.from === a.id && c.to === b.id) || (c.from === b.id && c.to === a.id))) continue;
    const side = rng.pick(SIDES);
    const opposite = OPPOSITE[side];
    const [a0, a1] = sideSpan(a.rect, side);
    const [b0, b1] = sideSpan(b.rect, opposite);
    const lo = Math.max(a0, b0) + GEN_CONFIG.doorCornerMargin;
    const hi = Math.min(a1, b1) - GEN_CONFIG.doorCornerMargin - W;
    if (hi - lo < 0.2) continue;
    const doorU0 = rng.range(lo, hi);
    const doorU1 = doorU0 + W;
    if (doorBlocked(a, side, doorU0, doorU1) || doorBlocked(b, opposite, doorU0, doorU1)) continue;
    const wa = sideWallLine(a.rect, side);
    const wb = sideWallLine(b.rect, opposite);
    let loopRect;
    if (side === 'N' || side === 'S') loopRect = rect(doorU0, Math.min(wa, wb) - seam, doorU1, Math.max(wa, wb) + seam);
    else loopRect = rect(Math.min(wa, wb) - seam, doorU0, Math.max(wa, wb) + seam, doorU1);
    const span = side === 'N' || side === 'S' ? loopRect.z1 - loopRect.z0 : loopRect.x1 - loopRect.x0;
    if (span < W + 1) continue;
    if (footprints().some((entry) => entry.owner !== a.id && entry.owner !== b.id && intersects(inflate(loopRect, 0.7), entry.rect))) continue;
    const corridor = {
      id: `f${floorIndex}-corridor-${corridors.length}`, kind: 'walk', type: rng.pick(CORRIDOR_TYPES), rects: [loopRect],
      from: a.id, fromSide: side, to: b.id, toSide: opposite,
      width: W, height: GEN_CONFIG.corridorHeight, water: [], pillars: []
    };
    corridors.push(corridor);
    a.doors.push({ side, u0: doorU0, u1: doorU1, corridorId: corridor.id, height: GEN_CONFIG.corridorHeight });
    b.doors.push({ side: opposite, u0: doorU0, u1: doorU1, corridorId: corridor.id, height: GEN_CONFIG.corridorHeight });
  }

  const waterBodies = [];
  const lights = [];
  for (const room of rooms) {
    for (const basin of room.features.basins) {
      const [cx, cz] = center(basin.rect);
      waterBodies.push({ rect: basin.rect, centerX: cx, centerZ: cz, level: basin.level, depth: basin.depth, kind: 'basin', owner: room.id });
    }
    const [cx, cz] = center(room.rect);
    lights.push({
      position: [cx, room.height - 1.1, cz],
      color: ROOM_LIGHT_COLORS[room.type],
      intensity: 55,
      distance: Math.max(room.rect.x1 - room.rect.x0, room.rect.z1 - room.rect.z0) * 1.05,
      shadow: false
    });
  }

  for (const corridor of corridors) {
    corridor.water = corridorWater(corridor, rng);
    corridor.pillars = corridorPillars(corridor);
    for (const body of corridor.water) {
      const [cx, cz] = center(body.rect);
      waterBodies.push({ ...body, centerX: cx, centerZ: cz, kind: 'channel', owner: corridor.id });
    }
    const [cx, cz] = center(corridor.rects[0]);
    lights.push({ position: [cx, corridor.height - 0.7, cz], color: '#9fe8ef', intensity: 14, distance: 11, shadow: false });
  }

  const bounds = rooms.reduce((acc, room) => ({
    minX: Math.min(acc.minX, room.rect.x0), maxX: Math.max(acc.maxX, room.rect.x1),
    minZ: Math.min(acc.minZ, room.rect.z0), maxZ: Math.max(acc.maxZ, room.rect.z1)
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

  return { index: floorIndex, rooms, corridors, waterBodies, lights, bounds };
}

/* ------------------------------------------------------------- dive tunnels */

/** Fully flooded swim-through pipes joining two basins under the decks. */
function addDiveTunnels(floor, rng, count) {
  const added = [];
  const candidates = rng.shuffle(floor.rooms.filter((room) => room.features.basins.length && room.features.basins[0].depth >= 1.2));
  for (let i = 0; i < candidates.length && added.length < count; i += 1) {
    for (let j = i + 1; j < candidates.length && added.length < count; j += 1) {
      const a = candidates[i];
      const b = candidates[j];
      const ba = a.features.basins[0];
      const bb = b.features.basins[0];
      if (ba.mouths.length || bb.mouths.length) continue;
      const w = GEN_CONFIG.diveWidth;
      let tunnel = null;
      let aSide = null; let bSide = null;
      // North/south alignment.
      const xLo = Math.max(ba.rect.x0, bb.rect.x0) + 1.0;
      const xHi = Math.min(ba.rect.x1, bb.rect.x1) - 1.0;
      const zLo = Math.max(ba.rect.z0, bb.rect.z0) + 1.0;
      const zHi = Math.min(ba.rect.z1, bb.rect.z1) - 1.0;
      if (xHi - xLo >= w + 0.6 && (a.rect.z1 < b.rect.z0 || b.rect.z1 < a.rect.z0)) {
        const u = rng.range(xLo + w / 2, xHi - w / 2);
        if (a.rect.z1 < b.rect.z0) { tunnel = rect(u - w / 2, a.rect.z0, u + w / 2, b.rect.z1); aSide = 'N'; bSide = 'S'; }
        else { tunnel = rect(u - w / 2, b.rect.z0, u + w / 2, a.rect.z1); aSide = 'S'; bSide = 'N'; }
      } else if (zHi - zLo >= w + 0.6 && (a.rect.x1 < b.rect.x0 || b.rect.x1 < a.rect.x0)) {
        const u = rng.range(zLo + w / 2, zHi - w / 2);
        if (a.rect.x1 < b.rect.x0) { tunnel = rect(a.rect.x1, u - w / 2, b.rect.x0, u + w / 2); aSide = 'E'; bSide = 'W'; }
        else { tunnel = rect(b.rect.x1, u - w / 2, a.rect.x0, u + w / 2); aSide = 'W'; bSide = 'E'; }
      }
      if (!tunnel) continue;
      const others = floor.rooms.filter((room) => room !== a && room !== b);
      if (others.some((room) => intersects(inflate(tunnel, 0.8), room.rect))) continue;
      if (floor.corridors.some((corridor) => corridor.rects.some((r) => intersects(inflate(tunnel, 0.8), r)))) continue;

      const floorY = -Math.min(ba.depth, bb.depth);
      const top = GEN_CONFIG.diveCeiling;
      const mouth = { u0: aSide === 'N' || aSide === 'S' ? tunnel.x0 : tunnel.z0, u1: aSide === 'N' || aSide === 'S' ? tunnel.x1 : tunnel.z1, top, bottom: floorY };
      ba.mouths.push({ side: aSide, ...mouth });
      bb.mouths.push({ side: bSide, ...mouth });
      const corridor = {
        id: `${floor.index}-dive-${added.length}`,
        kind: 'dive',
        type: 'dive',
        rects: [tunnel],
        from: a.id, fromSide: aSide, to: b.id, toSide: bSide,
        width: w, height: top - floorY, floorY, noClip: true,
        water: [{ rect: tunnel, level: -0.3, depth: -0.3 - floorY }],
        pillars: []
      };
      floor.corridors.push(corridor);
      const [cx, cz] = center(tunnel);
      floor.waterBodies.push({ rect: tunnel, centerX: cx, centerZ: cz, level: -0.3, depth: -0.3 - floorY, kind: 'dive', owner: corridor.id });
      floor.lights.push({ position: [cx, top - 0.25, cz], color: '#69d8e6', intensity: 6, distance: 7, shadow: false });
      added.push(corridor);
    }
  }
  return added;
}

/* -------------------------------------------------------- corridor pillars */

function corridorPillars(corridor) {
  const pillars = [];
  if (corridor.kind === 'dive') return pillars;
  const r = corridor.rects[0];
  const long = r.x1 - r.x0 >= r.z1 - r.z0;
  if (corridor.type === 'scallop') {
    const seamEndOf = (index) => {
      if (index === 0) return SEAM_END[corridor.fromSide];
      if (index === corridor.rects.length - 1) return SEAM_END[corridor.toSide];
      return null;
    };
    corridor.rects.forEach((rectOfCorridor, index) => {
      const isLong = rectOfCorridor.x1 - rectOfCorridor.x0 >= rectOfCorridor.z1 - rectOfCorridor.z0;
      const len = isLong ? rectOfCorridor.x1 - rectOfCorridor.x0 : rectOfCorridor.z1 - rectOfCorridor.z0;
      const count = Math.max(2, Math.floor(len / 1.7));
      const keepClear = 1.9;
      for (let i = 0; i <= count; i += 1) {
        const along = ((i + 0.5) / (count + 1)) * len;
        const end = seamEndOf(index);
        const nearSeam = (end === 'xmin' || end === 'zmin') ? along < keepClear
          : (end === 'xmax' || end === 'zmax') ? len - along < keepClear : false;
        if (nearSeam) continue;
        if (isLong) {
          const x = rectOfCorridor.x0 + along;
          pillars.push({ shape: 'circle', x, z: rectOfCorridor.z0, r: 0.45 });
          pillars.push({ shape: 'circle', x, z: rectOfCorridor.z1, r: 0.45 });
        } else {
          const z = rectOfCorridor.z0 + along;
          pillars.push({ shape: 'circle', x: rectOfCorridor.x0, z, r: 0.45 });
          pillars.push({ shape: 'circle', x: rectOfCorridor.x1, z, r: 0.45 });
        }
      }
    });
  } else if (corridor.type === 'darkChannel') {
    const len = long ? r.x1 - r.x0 : r.z1 - r.z0;
    const count = Math.max(1, Math.floor((len - 3) / 3.2));
    for (let i = 0; i < count; i += 1) {
      const t = (i + 1) / (count + 1);
      if (long) pillars.push({ shape: 'circle', x: r.x0 + len * t, z: r.z1 - 0.75, r: 0.3 });
      else pillars.push({ shape: 'circle', x: r.x1 - 0.75, z: r.z0 + len * t, r: 0.3 });
    }
  }
  return pillars;
}

/* ------------------------------------------------------- corridor channels */

function corridorWater(corridor, rng) {
  if (corridor.kind === 'dive') return corridor.water ?? [];
  const dry = GEN_CONFIG.channelDryEdge;
  const edge = 0.55;
  const W = corridor.width;
  const rects = corridor.rects;
  const seamEndOf = (index) => {
    const ends = {};
    if (index === 0) ends[SEAM_END[corridor.fromSide]] = true;
    if (index === rects.length - 1) ends[SEAM_END[corridor.toSide]] = true;
    return ends;
  };
  const bodies = [];

  if (corridor.type === 'archVault') {
    rects.forEach((r, index) => {
      const long = r.x1 - r.x0 >= r.z1 - r.z0;
      const ends = seamEndOf(index);
      let cornerEnd = null;
      if (index > 0) {
        const cz = (r.z0 + r.z1) / 2;
        const cx = (r.x0 + r.x1) / 2;
        if (long) cornerEnd = inside(rects[0], r.x0 + 0.2, cz) ? 'xmin' : 'xmax';
        else cornerEnd = inside(rects[0], cx, r.z0 + 0.2) ? 'zmin' : 'zmax';
      }
      const shrinkAt = (endName) => {
        if (ends[endName]) return dry;
        if (cornerEnd === endName) return W + 0.4;
        return 0;
      };
      if (long) bodies.push({ rect: rect(r.x0 + shrinkAt('xmin'), r.z0 + edge, r.x1 - shrinkAt('xmax'), r.z1 - edge), level: -0.12, depth: 0.4 });
      else bodies.push({ rect: rect(r.x0 + edge, r.z0 + shrinkAt('zmin'), r.x1 - edge, r.z1 - shrinkAt('zmax')), level: -0.12, depth: 0.4 });
    });
  } else {
    const r = rects[0];
    const long = r.x1 - r.x0 >= r.z1 - r.z0;
    const ends = seamEndOf(0);
    const farEndShrink = rects.length > 1 ? 0 : dry;
    if (corridor.type === 'darkChannel') {
      const channelWidth = rng.range(1.1, 1.5);
      const offset = 0.35;
      if (long) {
        const x0 = r.x0 + (ends.xmin ? dry : 0);
        const x1 = r.x1 - (ends.xmax ? dry : farEndShrink);
        bodies.push({ rect: rect(x0, r.z0 + offset, x1, r.z0 + offset + channelWidth), level: -0.1, depth: 0.3 });
      } else {
        const z0 = r.z0 + (ends.zmin ? dry : 0);
        const z1 = r.z1 - (ends.zmax ? dry : farEndShrink);
        bodies.push({ rect: rect(r.x0 + offset, z0, r.x0 + offset + channelWidth, z1), level: -0.1, depth: 0.3 });
      }
    } else {
      const width = rng.range(1.7, 2.2);
      if (long) {
        const zc = (r.z0 + r.z1) / 2;
        const x0 = r.x0 + (ends.xmin ? dry : 0);
        const x1 = r.x1 - (ends.xmax ? dry : farEndShrink);
        bodies.push({ rect: rect(x0, zc - width / 2, x1, zc + width / 2), level: -0.16, depth: 0.5 });
      } else {
        const xc = (r.x0 + r.x1) / 2;
        const z0 = r.z0 + (ends.zmin ? dry : 0);
        const z1 = r.z1 - (ends.zmax ? dry : farEndShrink);
        bodies.push({ rect: rect(xc - width / 2, z0, xc + width / 2, z1), level: -0.16, depth: 0.5 });
      }
    }
  }
  return bodies.filter((body) => body.rect.x1 - body.rect.x0 > 0.6 && body.rect.z1 - body.rect.z0 > 0.6);
}

/* ----------------------------------------------------------------- level */

export function generateLevel({ seed = 1, roomCount = 7 } = {}) {
  const rng = new Rng(seed);
  const floors = [
    makeFloor(rng, 0, roomCount),
    makeFloor(rng, 1, Math.max(3, Math.round(roomCount * 0.55))),
    makeFloor(rng, 2, Math.max(3, Math.round(roomCount * 0.45)))
  ];

  // Dive tunnels on the main floor and, sometimes, the upper floor.
  addDiveTunnels(floors[0], rng, rng.int(1, 2));
  if (rng.chance(0.6)) addDiveTunnels(floors[1], rng, 1);

  // Vertical connectors: main<->upper (stair up / hatch down),
  // main<->sublevel (hatch down / stair up).
  const vertical = [];
  const pairFloors = (lowerIndex, upperIndex) => {
    const lower = floors[lowerIndex];
    const upper = floors[upperIndex];
    const lowerRoom = lower.rooms.find((room) => room.type === 'stairwell' && !room.features.stairwell);
    const upperRoom = upper.rooms.find((room) => room.type === 'stairwell' && !room.features.stairwell);
    if (!lowerRoom || !upperRoom) return;
    placeStairwell(lowerRoom, 'up', rng);
    placeStairwell(upperRoom, 'down', rng);
    if (lowerRoom.features.stairwell.variant !== 'up' || upperRoom.features.stairwell.variant !== 'down') return;
    const zone = lowerRoom.features.stairwell.zone;
    const hole = upperRoom.features.stairwell.hole;
    const [hx, hz] = center(hole);
    const [rx, rz] = center(upperRoom.rect);
    const dirX = Math.sign(rx - hx) || 1;
    const dirZ = Math.sign(rz - hz) || 1;
    const arrive = Math.abs(rx - hx) > Math.abs(rz - hz)
      ? { x: hx + dirX * (hole.x1 - hole.x0) / 2 + 1.4, z: hz }
      : { x: hx, z: hz + dirZ * (hole.z1 - hole.z0) / 2 + 1.4 };
    const [lx, lz] = center(zone);
    vertical.push(
      { id: `lift-${vertical.length}`, type: 'up', floor: lowerIndex, rect: zone, triggerY: 2.3, toFloor: upperIndex, to: { x: arrive.x, z: arrive.z, y: 0.05 } },
      { id: `lift-${vertical.length + 1}`, type: 'down', floor: upperIndex, rect: inflate(hole, 0.1), triggerY: -0.5, toFloor: lowerIndex, to: { x: lx, z: lz, y: 2.65 } }
    );
  };
  pairFloors(0, 1);
  pairFloors(0, 2);
  // Unpaired stairwell rooms become mini pool rooms.
  for (const floor of floors) {
    for (const room of floor.rooms) {
      if (room.type === 'stairwell' && !room.features.stairwell) placeStairwell(room, 'pool', rng);
    }
  }

  const main = floors[0];
  const spawn = {
    floor: 0,
    x: (main.rooms[0].rect.x0 + main.rooms[0].rect.x1) / 2,
    z: main.rooms[0].rect.z1 - 2.6,
    lookX: (main.rooms[0].rect.x0 + main.rooms[0].rect.x1) / 2,
    lookZ: (main.rooms[0].rect.z0 + main.rooms[0].rect.z1) / 2
  };

  return { seed, floors, vertical, spawn, config: GEN_CONFIG };
}
