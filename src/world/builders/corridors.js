import {
  floorRect, ceilingRect, wallSeg, subtractRects, cylinderPillar, vaultCeiling, archRib, lightShaft, pipeRun
} from './kit.js';
import { intersects } from '../levelGen.js';

/** Which end of a corridor rect overlaps the room it plugs into. */
const SEAM_END = Object.freeze({ N: 'zmax', S: 'zmin', E: 'xmin', W: 'xmax' });
/** How deep pipes/vaults stop short of the room wall plane. */
const SEAM_STOP = 0.95;

function subtractSpans(span, cuts) {
  let pieces = [span];
  for (const [c0, c1] of cuts) {
    const next = [];
    for (const [p0, p1] of pieces) {
      if (c1 <= p0 + 1e-4 || c0 >= p1 - 1e-4) { next.push([p0, p1]); continue; }
      if (c0 > p0) next.push([p0, c0]);
      if (c1 < p1) next.push([c1, p1]);
    }
    pieces = next;
  }
  return pieces.filter(([p0, p1]) => p1 - p0 > 0.05);
}

/** Which ends of a rect stop short of a room wall (the seam overlaps). */
function seamEndsOf(index, corridor) {
  const last = corridor.rects.length - 1;
  const single = index === 0 && index === last;
  return single
    ? [SEAM_END[corridor.fromSide], SEAM_END[corridor.toSide]]
    : index === 0 ? [SEAM_END[corridor.fromSide]]
      : index === last ? [SEAM_END[corridor.toSide]] : [];
}

/** Shrink a rect at the ends whose overlap belongs to a room (the seam). */
function clipSeamEnds(r, index, corridor) {
  const ends = seamEndsOf(index, corridor);
  const cut = (name) => (ends.includes(name) ? SEAM_STOP : 0);
  return {
    x0: r.x0 + cut('xmin'),
    z0: r.z0 + cut('zmin'),
    x1: r.x1 - cut('xmax'),
    z1: r.z1 - cut('zmax')
  };
}

/** Builds one corridor archetype into `group`. `walls` are its segments.
 *  `rooms` lets the builder clip floors/ceilings/shells so nothing pokes
 *  through doorways into rooms (no floating slabs, no coplanar z-fighting). */
export function buildCorridor(group, corridor, walls, materials, rooms = []) {
  const bodies = corridor.water ?? [];
  const roomRects = rooms.map((room) => room.rect);

  corridor.rects.forEach((r, index) => {
    // Floor: this rect minus water holes, minus the neighbour rect of an
    // L-corner, minus every room footprint (the seam overlap belongs to the
    // room deck — overlapping coplanar planes would z-fight).
    const holes = [...bodies.map((body) => body.rect)];
    if (corridor.rects.length > 1) {
      if (index === 0) holes.push(corridor.rects[1]);
      else holes.push(corridor.rects[index - 1]);
    }
    const clip = roomRects.filter((rect) => intersects(rect, r));
    for (const piece of subtractRects(r, [...holes, ...clip])) floorRect(group, piece, 0, materials.deck);

    // Channel basins: shallow shells.
    if (index === 0) {
      for (const body of bodies) {
        const br = body.rect;
        floorRect(group, br, -body.depth, materials.pool);
        wallSeg(group, { x0: br.x0, z0: br.z0, x1: br.x1, z1: br.z0 }, -body.depth, 0, materials.pool);
        wallSeg(group, { x0: br.x0, z0: br.z1, x1: br.x1, z1: br.z1 }, -body.depth, 0, materials.pool);
        wallSeg(group, { x0: br.x0, z0: br.z0, x1: br.x0, z1: br.z1 }, -body.depth, 0, materials.pool);
        wallSeg(group, { x0: br.x1, z0: br.z0, x1: br.x1, z1: br.z1 }, -body.depth, 0, materials.pool);
      }
    }

    const springY = corridor.height - 1.1;
    const wallTop = corridor.type === 'archVault' ? springY : corridor.height;
    for (const wall of walls) {
      if (wall.owner === `${corridor.id}#${index}`) wallSeg(group, wall, 0, wallTop, materials.wall);
    }

    if (corridor.type === 'archVault') {
      // Vault stops at the room wall plane instead of poking through doors.
      const vaultRect = clipSeamEnds(r, index, corridor);
      const long = vaultRect.x1 - vaultRect.x0 >= vaultRect.z1 - vaultRect.z0;
      const spanLen = long ? vaultRect.x1 - vaultRect.x0 : vaultRect.z1 - vaultRect.z0;
      if (spanLen > 1.2) {
        const radius = vaultCeiling(group, vaultRect, springY, materials.ceiling);
        const start = long ? vaultRect.x0 : vaultRect.z0;
        for (let at = start + 1.4; at < start + spanLen - 0.6; at += 2.6) {
          archRib(group, vaultRect, at, radius, springY, materials.wall);
        }
        // Springing shelves so the vault meets the walls cleanly.
        ceilingRect(group, long
          ? { x0: vaultRect.x0, z0: vaultRect.z0, x1: vaultRect.x1, z1: vaultRect.z0 + 0.02 }
          : { x0: vaultRect.x0, z0: vaultRect.z0, x1: vaultRect.x0 + 0.02, z1: vaultRect.z1 }, springY, materials.ceiling);
      }
    } else {
      const ceilingHoles = index === 0 && corridor.rects.length > 1 ? [corridor.rects[1]] : [];
      for (const piece of subtractRects(r, [...ceilingHoles, ...clip])) {
        ceilingRect(group, piece, corridor.height, materials.ceiling);
      }
    }
  });

  if (corridor.type === 'darkChannel') {
    const r = corridor.rects[0];
    const long = r.x1 - r.x0 >= r.z1 - r.z0;
    const shaftSide = long ? 'N' : 'E';
    const line = shaftSide === 'N' ? r.z0 : r.x1;
    const span = long ? [r.x0 + 2, r.x1 - 2] : [r.z0 + 2, r.z1 - 2];
    const count = Math.max(1, Math.floor((span[1] - span[0]) / 4.5));
    for (let i = 0; i < count; i += 1) {
      const u = span[0] + ((i + 0.5) / count) * (span[1] - span[0]);
      lightShaft(group, shaftSide, line, u, 1.1, 0.9, 2.6, materials);
    }
  }

  if (corridor.type === 'scallop') {
    for (const pillar of corridor.pillars ?? []) {
      cylinderPillar(group, pillar.x, pillar.z, pillar.r, 0, corridor.height, materials.wall, 18);
    }
  }

  // Ceiling pipe runs in walk corridors (трубы): stopped short of doorways
  // and joined by an elbow at L-corners so nothing dangles in mid-air.
  if (corridor.kind !== 'dive') buildCeilingPipes(group, corridor, materials);

  if (corridor.kind === 'dive') buildDiveTunnel(group, corridor, materials, rooms);
}

function buildCeilingPipes(group, corridor, materials) {
  const lines = [];
  corridor.rects.forEach((r, index) => {
    const long = r.x1 - r.x0 >= r.z1 - r.z0;
    const span = clipSeamEnds(r, index, corridor);
    const a = long ? span.x0 : span.z0;
    const b = long ? span.x1 : span.z1;
    if (b - a < 0.8) return;
    const off = index % 2 === 0 ? 0.55 : 0.85;
    const fixed = long ? r.z0 + off : r.x0 + off;
    lines.push({ axis: long ? 'x' : 'z', fixed, a });
    const pipeYs = [[corridor.height - 0.32, 0.09], [corridor.height - 0.54, 0.06]];
    for (const [y, radius] of pipeYs) {
      if (long) pipeRun(group, [a, y, fixed], [b, y, fixed], radius, materials.metal);
      else pipeRun(group, [fixed, y, a], [fixed, y, b], radius, materials.metal);
    }
    // Finished pipe system: runs that stop short of a wall turn upward into
    // the ceiling instead of dangling with open ends.
    const ends = seamEndsOf(index, corridor);
    const stoppedMin = ends.includes(long ? 'xmin' : 'zmin');
    const stoppedMax = ends.includes(long ? 'xmax' : 'zmax');
    for (const coord of [stoppedMin ? a : null, stoppedMax ? b : null]) {
      if (coord === null) continue;
      for (const [y] of pipeYs) {
        if (long) pipeRun(group, [coord, y, fixed], [coord, corridor.height + 0.4, fixed], 0.07, materials.metal);
        else pipeRun(group, [fixed, y, coord], [fixed, corridor.height + 0.4, coord], 0.07, materials.metal);
      }
    }
  });
  // Elbow at the L-corner: stretch the second rect's pipes back onto the
  // first pipe line so the two runs meet instead of dangling.
  if (lines.length === 2 && lines[0].axis !== lines[1].axis) {
    const [first, second] = lines;
    for (const [y, radius] of [[corridor.height - 0.32, 0.09], [corridor.height - 0.54, 0.06]]) {
      if (second.axis === 'x') {
        const from = Math.min(first.fixed, second.a);
        if (second.a - from > 0.05) pipeRun(group, [from, y, second.fixed], [second.a, y, second.fixed], radius, materials.metal);
      } else {
        const from = Math.min(first.fixed, second.a);
        if (second.a - from > 0.05) pipeRun(group, [second.fixed, y, from], [second.fixed, y, second.a], radius, materials.metal);
      }
    }
  }
}

/** Fully flooded swim-through pipe: shell, rib frames and guide lights.
 *  The shell is clipped against both basins so no slab floats in the pool. */
function buildDiveTunnel(group, corridor, materials, rooms) {
  const r = corridor.rects[0];
  const y0 = corridor.floorY;
  const top = y0 + corridor.height;
  const fromRoom = rooms.find((room) => room.id === corridor.from);
  const toRoom = rooms.find((room) => room.id === corridor.to);
  const basins = [fromRoom?.features.basins[0]?.rect, toRoom?.features.basins[0]?.rect]
    .filter((rect) => rect && intersects(rect, r));

  for (const piece of subtractRects(r, basins)) {
    floorRect(group, piece, y0, materials.pool);
    ceilingRect(group, piece, top, materials.pool);
  }
  const long = r.x1 - r.x0 >= r.z1 - r.z0;
  const sides = [
    { along: 'x', fixed: r.z0 },
    { along: 'x', fixed: r.z1 },
    { along: 'z', fixed: r.x0 },
    { along: 'z', fixed: r.x1 }
  ];
  for (const side of sides) {
    const cuts = basins
      .filter((b) => (side.along === 'x'
        ? b.z0 < side.fixed - 1e-4 && b.z1 > side.fixed + 1e-4
        : b.x0 < side.fixed - 1e-4 && b.x1 > side.fixed + 1e-4))
      .map((b) => (side.along === 'x' ? [b.x0, b.x1] : [b.z0, b.z1]));
    const span = side.along === 'x' ? [r.x0, r.x1] : [r.z0, r.z1];
    for (const [p0, p1] of subtractSpans(span, cuts)) {
      wallSeg(group, side.along === 'x'
        ? { x0: p0, z0: side.fixed, x1: p1, z1: side.fixed }
        : { x0: side.fixed, z0: p0, x1: side.fixed, z1: p1 }, y0, top, materials.pool);
    }
  }

  // Rib frames, skipped where the tunnel passes under a basin.
  const length = long ? r.x1 - r.x0 : r.z1 - r.z0;
  const start = long ? r.x0 : r.z0;
  const sliceAt = (at) => (long
    ? { x0: at, z0: r.z0, x1: at, z1: r.z1 }
    : { x0: r.x0, z0: at, x1: r.x1, z1: at });
  for (let at = start + 1.2; at < start + length - 0.4; at += 2.4) {
    if (basins.some((b) => intersects(b, sliceAt(at)))) continue;
    const frameY = (y0 + top) / 2;
    if (long) {
      pipeRun(group, [r.x0 + 0.06, frameY, at], [r.x1 - 0.06, frameY, at], 0.05, materials.metal);
      pipeRun(group, [r.x0 + 0.06, top - 0.06, at], [r.x1 - 0.06, top - 0.06, at], 0.05, materials.metal);
    } else {
      pipeRun(group, [at, frameY, r.z0 + 0.06], [at, frameY, r.z1 - 0.06], 0.05, materials.metal);
      pipeRun(group, [at, top - 0.06, r.z0 + 0.06], [at, top - 0.06, r.z1 - 0.06], 0.05, materials.metal);
    }
  }

  // Guide light lines along both top corners, clipped at the basins.
  const glowY = top - 0.12;
  const alongSpan = long ? [r.x0, r.x1] : [r.z0, r.z1];
  const cuts = basins.map((b) => (long ? [b.z0, b.z1] : [b.x0, b.x1]));
  for (const [p0, p1] of subtractSpans(alongSpan, cuts)) {
    const a0 = p0 + (p0 === alongSpan[0] ? 0.1 : 0);
    const a1 = p1 - (p1 === alongSpan[1] ? 0.1 : 0);
    if (a1 - a0 < 0.3) continue;
    if (long) {
      pipeRun(group, [a0, glowY, r.z0 + 0.1], [a1, glowY, r.z0 + 0.1], 0.02, materials.poolLight);
      pipeRun(group, [a0, glowY, r.z1 - 0.1], [a1, glowY, r.z1 - 0.1], 0.02, materials.poolLight);
    } else {
      pipeRun(group, [r.x0 + 0.1, glowY, a0], [r.x0 + 0.1, glowY, a1], 0.02, materials.poolLight);
      pipeRun(group, [r.x1 - 0.1, glowY, a0], [r.x1 - 0.1, glowY, a1], 0.02, materials.poolLight);
    }
  }
}
