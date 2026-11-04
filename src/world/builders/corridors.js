import {
  floorRect, ceilingRect, wallSeg, subtractRects, cylinderPillar, vaultCeiling, archRib, lightShaft, pipeRun
} from './kit.js';

/** Builds one corridor archetype into `group`. `walls` are its segments. */
export function buildCorridor(group, corridor, walls, materials) {
  const bodies = corridor.water ?? [];

  corridor.rects.forEach((r, index) => {
    // Floor: this rect minus water holes; the first rect also yields the
    // corner square to the second rect so floor pieces never overlap.
    const holes = [...bodies.map((body) => body.rect)];
    if (index === 0 && corridor.rects.length > 1) holes.push(corridor.rects[1]);
    for (const piece of subtractRects(r, holes)) floorRect(group, piece, 0, materials.deck);

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
      const radius = vaultCeiling(group, r, springY, materials.ceiling);
      const long = r.x1 - r.x0 >= r.z1 - r.z0;
      const length = long ? r.x1 - r.x0 : r.z1 - r.z0;
      const start = long ? r.x0 : r.z0;
      for (let at = start + 1.4; at < start + length - 0.6; at += 2.6) {
        archRib(group, r, at, radius, springY, materials.wall);
      }
      // Springing shelves so the vault meets the walls cleanly.
      ceilingRect(group, long ? { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z0 + 0.02 } : { x0: r.x0, z0: r.z0, x1: r.x0 + 0.02, z1: r.z1 }, springY, materials.ceiling);
    } else {
      const ceilingPiece = index === 0 && corridor.rects.length > 1
        ? subtractRects(r, [corridor.rects[1]])
        : [r];
      for (const piece of ceilingPiece) ceilingRect(group, piece, corridor.height, materials.ceiling);
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

  // Ceiling pipe runs in walk corridors (трубы).
  if (corridor.kind !== 'dive') {
    corridor.rects.forEach((r, index) => {
      const long = r.x1 - r.x0 >= r.z1 - r.z0;
      const y = corridor.height - 0.32;
      const off = index % 2 === 0 ? 0.55 : 0.85;
      if (long) {
        pipeRun(group, [r.x0, y, r.z0 + off], [r.x1, y, r.z0 + off], 0.09, materials.metal);
        pipeRun(group, [r.x0, y - 0.22, r.z0 + off], [r.x1, y - 0.22, r.z0 + off], 0.06, materials.metal);
      } else {
        pipeRun(group, [r.x0 + off, y, r.z0], [r.x0 + off, y, r.z1], 0.09, materials.metal);
        pipeRun(group, [r.x0 + off, y - 0.22, r.z0], [r.x0 + off, y - 0.22, r.z1], 0.06, materials.metal);
      }
    });
  }

  if (corridor.kind === 'dive') buildDiveTunnel(group, corridor, materials);
}

/** Fully flooded swim-through pipe: shell, rib frames and guide lights. */
function buildDiveTunnel(group, corridor, materials) {
  const r = corridor.rects[0];
  const y0 = corridor.floorY;
  const top = y0 + corridor.height;
  floorRect(group, r, y0, materials.pool);
  ceilingRect(group, r, top, materials.pool);
  wallSeg(group, { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z0 }, y0, top, materials.pool);
  wallSeg(group, { x0: r.x0, z0: r.z1, x1: r.x1, z1: r.z1 }, y0, top, materials.pool);
  wallSeg(group, { x0: r.x0, z0: r.z0, x1: r.x0, z1: r.z1 }, y0, top, materials.pool);
  wallSeg(group, { x0: r.x1, z0: r.z0, x1: r.x1, z1: r.z1 }, y0, top, materials.pool);
  const long = r.x1 - r.x0 >= r.z1 - r.z0;
  const length = long ? r.x1 - r.x0 : r.z1 - r.z0;
  const start = long ? r.x0 : r.z0;
  for (let at = start + 1.2; at < start + length - 0.4; at += 2.4) {
    const frameY = (y0 + top) / 2;
    if (long) {
      pipeRun(group, [r.x0 + 0.06, frameY, at], [r.x1 - 0.06, frameY, at], 0.05, materials.metal);
      pipeRun(group, [r.x0 + 0.06, top - 0.06, at], [r.x1 - 0.06, top - 0.06, at], 0.05, materials.metal);
    } else {
      pipeRun(group, [at, frameY, r.z0 + 0.06], [at, frameY, r.z1 - 0.06], 0.05, materials.metal);
      pipeRun(group, [at, top - 0.06, r.z0 + 0.06], [at, top - 0.06, r.z1 - 0.06], 0.05, materials.metal);
    }
  }
  // Guide light lines along both top corners.
  const glowY = top - 0.12;
  if (long) {
    pipeRun(group, [r.x0 + 0.1, glowY, r.z0 + 0.1], [r.x1 - 0.1, glowY, r.z0 + 0.1], 0.02, materials.poolLight);
    pipeRun(group, [r.x0 + 0.1, glowY, r.z1 - 0.1], [r.x1 - 0.1, glowY, r.z1 - 0.1], 0.02, materials.poolLight);
  } else {
    pipeRun(group, [r.x0 + 0.1, glowY, r.z0 + 0.1], [r.x0 + 0.1, glowY, r.z1 - 0.1], 0.02, materials.poolLight);
    pipeRun(group, [r.x1 - 0.1, glowY, r.z0 + 0.1], [r.x1 - 0.1, glowY, r.z1 - 0.1], 0.02, materials.poolLight);
  }
}
