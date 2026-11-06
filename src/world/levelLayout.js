/**
 * Collision and ground-height queries for a generated level.
 *
 * The walkable region is the union of all footprints (rooms + corridor rects).
 * Wall segments are derived by clipping every footprint edge against the
 * interiors of the other footprints and against door openings, so seams and
 * doorways have no walls while the true outer boundary does. A position is
 * standable when the point lies inside the union AND a disk of the player
 * radius around it clears every wall segment, pillar and solid obstacle.
 * That disk test is exact for rectilinear unions, which fixes the old
 * single-room clamp / single-pass pillar push-out approach.
 *
 * Pure JS (no Three.js) so Node tests can exercise it.
 */
import { surfaceHeight } from './waterMath.js';

const EPS = 1e-4;

function pointSegmentDistance(px, pz, x0, z0, x1, z1) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const lengthSq = dx * dx + dz * dz;
  let t = lengthSq > 0 ? ((px - x0) * dx + (pz - z0) * dz) / lengthSq : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), pz - (z0 + t * dz));
}

function pointRectDistance(px, pz, r) {
  const dx = Math.max(r.x0 - px, 0, px - r.x1);
  const dz = Math.max(r.z0 - pz, 0, pz - r.z1);
  return Math.hypot(dx, dz);
}

function subtractIntervals(span, cuts) {
  let pieces = [span];
  for (const [c0, c1] of cuts) {
    const next = [];
    for (const [p0, p1] of pieces) {
      if (c1 <= p0 + EPS || c0 >= p1 - EPS) { next.push([p0, p1]); continue; }
      if (c0 > p0 + EPS) next.push([p0, c0]);
      if (c1 < p1 - EPS) next.push([c1, p1]);
    }
    pieces = next;
  }
  return pieces.filter(([p0, p1]) => p1 - p0 > EPS);
}

/** All footprint rects of a level, tagged with owner and height. */
export function levelRects(level) {
  const rects = [];
  for (const room of level.rooms) rects.push({ rect: room.rect, owner: room.id, kind: 'room', height: room.height, room });
  for (const corridor of level.corridors) {
    corridor.rects.forEach((r, index) => rects.push({ rect: r, owner: `${corridor.id}#${index}`, kind: 'corridor', height: corridor.height, corridor, index, noClip: corridor.noClip === true }));
  }
  return rects;
}

/**
 * Derive wall segments: every footprint edge portion that is NOT inside
 * another footprint and NOT a door opening becomes a wall.
 * Returns [{ x0, z0, x1, z1, height, owner, kind }].
 */
export function deriveWalls(level) {
  const rects = levelRects(level);
  const walls = [];

  for (const entry of rects) {
    const r = entry.rect;
    const doors = entry.kind === 'room' ? entry.room.doors : [];
    const edges = [
      { side: 'N', fixed: r.z0, axis: 'x', span: [r.x0, r.x1] },
      { side: 'S', fixed: r.z1, axis: 'x', span: [r.x0, r.x1] },
      { side: 'W', fixed: r.x0, axis: 'z', span: [r.z0, r.z1] },
      { side: 'E', fixed: r.x1, axis: 'z', span: [r.z0, r.z1] }
    ];
    for (const edge of edges) {
      const cuts = [];
      for (const other of rects) {
        if (other === entry) continue;
        if (other.noClip && entry.kind === 'room') continue; // dive tunnels pass under walls
        const o = other.rect;
        const strictlyAcross = edge.axis === 'x'
          ? o.z0 < edge.fixed - EPS && o.z1 > edge.fixed + EPS
          : o.x0 < edge.fixed - EPS && o.x1 > edge.fixed + EPS;
        if (!strictlyAcross) continue;
        cuts.push(edge.axis === 'x' ? [o.x0, o.x1] : [o.z0, o.z1]);
      }
      for (const door of doors) {
        if (door.side !== edge.side) continue;
        cuts.push([door.u0, door.u1]);
      }
      for (const [p0, p1] of subtractIntervals(edge.span, cuts)) {
        walls.push(edge.axis === 'x'
          ? { x0: p0, z0: edge.fixed, x1: p1, z1: edge.fixed, height: entry.height, owner: entry.owner, kind: entry.kind }
          : { x0: edge.fixed, z0: p0, x1: edge.fixed, z1: p1, height: entry.height, owner: entry.owner, kind: entry.kind });
      }
    }
  }
  return walls;
}

/* ------------------------------------------------------- ground heights */

function basinGround(basin, x, z) {
  if (!basin.stairs) return -basin.depth;
  const { stairs } = basin;
  const r = basin.rect;
  let distance = null;
  if (stairs.side === 'S') distance = r.z1 - z;
  if (stairs.side === 'N') distance = z - r.z0;
  if (stairs.side === 'E') distance = r.x1 - x;
  if (stairs.side === 'W') distance = x - r.x0;
  if (distance === null || distance < 0 || distance >= stairs.count * stairs.run) return -basin.depth;
  const step = Math.min(stairs.count - 1, Math.floor(distance / stairs.run));
  // Steps deeper than the basin floor clamp to the floor (no phantom pits).
  return Math.max(-(step + 1) * stairs.rise, -basin.depth);
}

function stairRunGround(run, x, z) {
  const r = run.rect;
  const t = run.axis === 'z' ? (z - r.z0) / (r.z1 - r.z0) : (x - r.x0) / (r.x1 - r.x0);
  // `enter` side is where the lowest step sits.
  const fromEnter = run.enter === 'N' || run.enter === 'W' ? t : 1 - t;
  const clamped = Math.max(0, Math.min(0.9999, fromEnter));
  const step = Math.floor(clamped * run.steps);
  return run.from + ((step + 1) / run.steps) * (run.to - run.from);
}

function roomGround(room, x, z) {
  const f = room.features;
  for (const hole of f.holes) {
    if (x > hole.rect.x0 && x < hole.rect.x1 && z > hole.rect.z0 && z < hole.rect.z1) return -hole.depth;
  }
  for (const landing of f.landings) {
    if (x > landing.rect.x0 && x < landing.rect.x1 && z > landing.rect.z0 && z < landing.rect.z1) return landing.y;
  }
  for (const run of f.stairRuns) {
    if (x > run.rect.x0 && x < run.rect.x1 && z > run.rect.z0 && z < run.rect.z1) return stairRunGround(run, x, z);
  }
  for (const island of f.islands) {
    if (x > island.x0 && x < island.x1 && z > island.z0 && z < island.z1) return 0;
  }
  for (const basin of f.basins) {
    if (x > basin.rect.x0 && x < basin.rect.x1 && z > basin.rect.z0 && z < basin.rect.z1) return basinGround(basin, x, z);
  }
  return 0;
}

function corridorGround(corridor, x, z) {
  if (corridor.kind === 'dive') return corridor.floorY;
  for (const body of corridor.water) {
    const r = body.rect;
    if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return -body.depth;
  }
  return 0;
}

/* ------------------------------------------------------------ collider */

export class LevelCollider {
  constructor(level) {
    this.level = level;
    this.rects = levelRects(level);
    this.walls = deriveWalls(level);
    this.pillars = [];
    this.solids = [];
    for (const room of level.rooms) {
      for (const pillar of room.features.pillars) {
        if (pillar.shape === 'circle') this.pillars.push(pillar);
        else this.solids.push({ x0: pillar.x - pillar.sx / 2, z0: pillar.z - pillar.sz / 2, x1: pillar.x + pillar.sx / 2, z1: pillar.z + pillar.sz / 2 });
      }
    }
    for (const corridor of level.corridors) {
      for (const pillar of corridor.pillars ?? []) {
        if (pillar.shape === 'circle') this.pillars.push(pillar);
      }
    }
    this.water = level.waterBodies;
  }

  rectAt(x, z) {
    // Rooms win over corridors so room features apply in seam zones.
    for (const entry of this.rects) {
      if (entry.kind === 'room' && x > entry.rect.x0 && x < entry.rect.x1 && z > entry.rect.z0 && z < entry.rect.z1) return entry;
    }
    for (const entry of this.rects) {
      if (x > entry.rect.x0 && x < entry.rect.x1 && z > entry.rect.z0 && z < entry.rect.z1) return entry;
    }
    return null;
  }

  /** Height of the walkable surface at (x, z). Deck level is y = 0. */
  getGroundHeight(x, z) {
    const entry = this.rectAt(x, z);
    if (!entry) return 0;
    if (entry.kind === 'room') return roomGround(entry.room, x, z);
    return corridorGround(entry.corridor, x, z);
  }

  waterBodyAt(x, z) {
    for (const body of this.water) {
      const r = body.rect;
      if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return body;
    }
    return null;
  }

  /** Water level and animated surface height at (x, z), or null when dry. */
  getWaterState(x, z, time = 0) {
    const body = this.waterBodyAt(x, z);
    if (!body) return null;
    return { level: body.level, surface: surfaceHeight(body, x, z, time), depth: body.depth };
  }

  /** True when a disk of `radius` at (x, z) fits inside the walkable union. */
  canStand(x, z, radius) {
    if (!this.rectAt(x, z)) return false;
    for (const wall of this.walls) {
      if (pointSegmentDistance(x, z, wall.x0, wall.z0, wall.x1, wall.z1) < radius - 1e-9) return false;
    }
    for (const pillar of this.pillars) {
      if (Math.hypot(x - pillar.x, z - pillar.z) < pillar.r + radius - 1e-9) return false;
    }
    for (const solid of this.solids) {
      if (pointRectDistance(x, z, solid) < radius - 1e-9) return false;
    }
    return true;
  }

  /**
   * Project a desired position into standable space. Keeps the previous
   * position when the target is blocked (per-axis movement already slides
   * along walls because the other axis is integrated separately).
   */
  resolveHorizontal(position, radius, previous) {
    if (this.canStand(position.x, position.z, radius)) return position;
    if (previous && this.canStand(previous.x, previous.z, radius)) {
      position.x = previous.x;
      position.z = previous.z;
    }
    return position;
  }
}
