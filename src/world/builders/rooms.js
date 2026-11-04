import * as THREE from 'three';
import {
  floorRect, ceilingRect, wallSeg, subtractRects, cylinderPillar, boxPillar,
  basinShell, islandBlock, landingBlock, stairRunSteps, handrailEdge, niche,
  lifebuoy, windowPanel, oculusCeiling, ceilingBeams, slopedRibCeiling,
  floorDrain, overflowGrate, inflowPipe, riserPipe, hatchGlow, hatchShaft,
  lightFixture, wallWindow
} from './kit.js';

function sideLine(r, side) {
  if (side === 'N') return r.z0;
  if (side === 'S') return r.z1;
  if (side === 'W') return r.x0;
  return r.x1;
}

function usOnSide(r, side, count, margin = 3) {
  const span = side === 'N' || side === 'S' ? [r.x0 + margin, r.x1 - margin] : [r.z0 + margin, r.z1 - margin];
  return Array.from({ length: count }, (_, i) => span[0] + ((i + 0.5) / count) * (span[1] - span[0]));
}

/** Builds one room archetype into `group`. `walls` are this room's segments. */
export function buildRoom(group, room, walls, materials) {
  const r = room.rect;
  const f = room.features;
  const basin = f.basins[0] ?? null;

  // Deck floor: room rect minus basin and hatch holes.
  const holes = [...f.basins.map((b) => b.rect), ...f.holes.map((h) => h.rect)];
  const deckPieces = subtractRects(r, holes);
  for (const piece of deckPieces) floorRect(group, piece, 0, materials.deck);
  for (const hole of f.holes) hatchShaft(group, hole.rect, hole.depth, materials);

  if (basin) basinShell(group, basin, materials.pool);
  for (const island of f.islands) islandBlock(group, island, basin?.depth ?? 1.5, materials.deck);
  for (const landing of f.landings) landingBlock(group, landing, 0, materials.deck);
  for (const run of f.stairRuns) stairRunSteps(group, run, materials.deck);

  for (const pillar of f.pillars) {
    if (pillar.shape === 'circle') cylinderPillar(group, pillar.x, pillar.z, pillar.r, 0, room.height, materials.wall);
    else boxPillar(group, pillar.x, pillar.z, pillar.sx, pillar.sz, 0, room.height, materials.wall);
  }

  // Walls with door openings, plus lintels above every door.
  for (const wall of walls) wallSeg(group, wall, 0, room.height, materials.wall);
  for (const door of room.doors) {
    const line = sideLine(r, door.side);
    if (door.side === 'N' || door.side === 'S') wallSeg(group, { x0: door.u0, z0: line, x1: door.u1, z1: line }, door.height, room.height, materials.wall);
    else wallSeg(group, { x0: line, z0: door.u0, x1: line, z1: door.u1 }, door.height, room.height, materials.wall);
  }

  // Ceiling.
  if (f.decor.oculus) {
    oculusCeiling(group, r, room.height, Math.min(r.x1 - r.x0, r.z1 - r.z0) * 0.22, materials.ceiling, materials.stripLight);
  } else if (f.decor.slopedCeiling) {
    const side = f.decor.slopedCeiling;
    const band = 0.55;
    const slope = side === 'N' ? { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z0 + (r.z1 - r.z0) * band }
      : side === 'S' ? { x0: r.x0, z0: r.z1 - (r.z1 - r.z0) * band, x1: r.x1, z1: r.z1 }
      : side === 'W' ? { x0: r.x0, z0: r.z0, x1: r.x0 + (r.x1 - r.x0) * band, z1: r.z1 }
      : { x0: r.x1 - (r.x1 - r.x0) * band, z0: r.z0, x1: r.x1, z1: r.z1 };
    const flat = side === 'N' ? { x0: r.x0, z0: slope.z1, x1: r.x1, z1: r.z1 }
      : side === 'S' ? { x0: r.x0, z0: r.z0, x1: r.x1, z1: slope.z0 }
      : side === 'W' ? { x0: slope.x1, z0: r.z0, x1: r.x1, z1: r.z1 }
      : { x0: r.x0, z0: r.z0, x1: slope.x0, z1: r.z1 };
    slopedRibCeiling(group, slope, side, room.height, materials);
    ceilingRect(group, flat, room.height, materials.ceiling);
  } else {
    ceilingRect(group, r, room.height, materials.ceiling);
  }
  if (f.decor.beams) ceilingBeams(group, r, room.height, materials);

  // Corner riser pipes (трубы).
  const risers = f.decor.pipes.risers ?? 0;
  const cornerSpots = [
    [r.x0 + 0.45, r.z0 + 0.45], [r.x1 - 0.45, r.z0 + 0.45],
    [r.x0 + 0.45, r.z1 - 0.45], [r.x1 - 0.45, r.z1 - 0.45]
  ];
  for (const [x, z] of cornerSpots.slice(0, risers)) riserPipe(group, x, z, 0, room.height, materials.metal);

  // Stairwell furniture: glow hatch above the landing, rails around hatches.
  if (f.stairwell?.variant === 'up' && f.stairwell.hatch) hatchGlow(group, f.stairwell.hatch, room.height, materials);
  for (const hole of f.holes) {
    // Rails on three sides; the ladder side stays open.
    handrailEdge(group, hole.rect, 'S', materials.metal, 0.12);
    handrailEdge(group, hole.rect, 'E', materials.metal, 0.12);
    handrailEdge(group, hole.rect, 'W', materials.metal, 0.12);
  }

  // Decor.
  if (f.decor.niches) {
    for (const u of usOnSide(r, f.decor.niches, 3)) niche(group, f.decor.niches, sideLine(r, f.decor.niches), u, materials);
  }
  if (f.decor.lifebuoys) {
    for (const u of usOnSide(r, f.decor.lifebuoys, 2, 4)) lifebuoy(group, f.decor.lifebuoys, sideLine(r, f.decor.lifebuoys), u, materials);
  }
  if (basin && f.decor.handrails) {
    for (const side of f.decor.handrails) handrailEdge(group, basin.rect, side, materials.metal);
  }
  if (f.decor.ceilingStrip) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(14, (r.x1 - r.x0) * 0.6), 0.9), materials.stripLight);
    strip.rotation.x = Math.PI / 2;
    strip.position.set((r.x0 + r.x1) / 2, room.height - 0.01, (r.z0 + r.z1) / 2);
    group.add(strip);
  }
  if (f.decor.windows && !f.decor.slopedCeiling) {
    const side = f.decor.windows;
    const line = sideLine(r, side);
    for (const u of usOnSide(r, side, 2, 3.5)) {
      windowPanel(group, side, line, u - 1.6, u + 1.6, 1.2, 3.4, materials.windowLight);
    }
  }

  // Procedural lighting: ceiling panels/strips generated per room.
  for (const fixture of f.decor.lightFixtures ?? []) lightFixture(group, fixture, materials);

  // Recessed wall windows glowing "from nowhere".
  for (const win of f.decor.wallWindows ?? []) wallWindow(group, win, sideLine(r, win.side), materials);
  if (basin) {
    // Floor drains and wall overflow grates (стоки).
    for (const drain of basin.drains ?? []) floorDrain(group, drain.x, drain.z, drain.r, -basin.depth, materials);
    const overflowSide = basin.stairs ? basin.stairs.side : 'N';
    for (const u of usOnSide(basin.rect, overflowSide === 'N' ? 'S' : 'N', 2, 1.5)) {
      overflowGrate(group, overflowSide === 'N' ? 'S' : 'N', sideLine(basin.rect, overflowSide === 'N' ? 'S' : 'N'), u, basin.level - 0.12, materials);
    }
    if (f.decor.pipes.inflow) {
      const { side, u } = f.decor.pipes.inflow;
      const span = side === 'N' || side === 'S' ? [basin.rect.x0, basin.rect.x1] : [basin.rect.z0, basin.rect.z1];
      inflowPipe(group, side, sideLine(r, side), span[0] + u * (span[1] - span[0]), 1.5, 1.3, materials);
    }
    // Underwater glow strips along two basin walls.
    const stripY = basin.level - 0.35;
    const far = new THREE.Mesh(new THREE.BoxGeometry(basin.rect.x1 - basin.rect.x0 - 0.2, 0.06, 0.04), materials.poolLight);
    far.position.set((basin.rect.x0 + basin.rect.x1) / 2, stripY, basin.rect.z0 + 0.03);
    const sideStrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, basin.rect.z1 - basin.rect.z0 - 0.2), materials.poolLight);
    sideStrip.position.set(basin.rect.x1 - 0.03, stripY, (basin.rect.z0 + basin.rect.z1) / 2);
    group.add(far, sideStrip);
  }
}
