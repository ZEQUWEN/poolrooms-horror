/**
 * Pure layout data and spatial queries for the Level 37 starting room.
 * This module has no Three.js dependency, so Node tests can import it.
 * Coordinates are in meters. The deck floor is at y = 0.
 */
export const POOL_LAYOUT = Object.freeze({
  halfSize: 12,
  height: 6.5,
  waterLevel: -0.3,
  pool: Object.freeze({ minX: -6, maxX: 6, minZ: -7, maxZ: 3, depth: 1.8 }),
  stairs: Object.freeze({ minX: -5.5, maxX: -2.5, stepDepth: 0.5, stepRise: 0.45, count: 3 }),
  pillarRadius: 0.55,
  pillars: Object.freeze([
    Object.freeze({ x: -9, z: -8 }),
    Object.freeze({ x: 9, z: -8 }),
    Object.freeze({ x: -9, z: 7 }),
    Object.freeze({ x: 9, z: 7 })
  ])
});

export function isInsidePool(x, z, layout = POOL_LAYOUT) {
  const { pool } = layout;
  return x > pool.minX && x < pool.maxX && z > pool.minZ && z < pool.maxZ;
}

/** Height of the walkable surface at (x, z). */
export function getGroundHeight(x, z, layout = POOL_LAYOUT) {
  if (!isInsidePool(x, z, layout)) return 0;
  const { pool, stairs } = layout;
  if (x >= stairs.minX && x <= stairs.maxX) {
    const step = Math.floor((pool.maxZ - z) / stairs.stepDepth);
    if (step < stairs.count) return -(step + 1) * stairs.stepRise;
  }
  return -pool.depth;
}

/** Keeps a circle of `radius` inside the room walls and outside pillars. Mutates position. */
export function resolveHorizontal(position, radius, layout = POOL_LAYOUT) {
  const limit = layout.halfSize - radius;
  position.x = Math.min(limit, Math.max(-limit, position.x));
  position.z = Math.min(limit, Math.max(-limit, position.z));

  const minDistance = layout.pillarRadius + radius;
  for (const pillar of layout.pillars) {
    const dx = position.x - pillar.x;
    const dz = position.z - pillar.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= minDistance) continue;
    if (distance < 1e-6) {
      position.x = pillar.x + minDistance;
      continue;
    }
    const scale = minDistance / distance;
    position.x = pillar.x + dx * scale;
    position.z = pillar.z + dz * scale;
  }
  return position;
}
