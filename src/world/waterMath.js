/**
 * Shared, dependency-free water surface math.
 * Both the Water mesh (vertex swell) and the gameplay queries
 * (is the camera below the surface?) use exactly this function, so the
 * visual surface and the swim/submerge logic can never disagree.
 */
export function waveOffset(localX, localY, time) {
  return Math.sin(localX * 0.9 + time * 0.8) * 0.018 + Math.cos(localY * 1.2 + time * 0.65) * 0.014;
}

/** World-space surface height of a water body at (x, z). */
export function surfaceHeight(body, x, z, time) {
  return body.level + waveOffset(x - body.centerX, -(z - body.centerZ), time);
}
