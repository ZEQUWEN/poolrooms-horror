/**
 * Pure helpers for the procedural lighting layer (no Three.js).
 *
 * Light specs come from levelGen: { position, color, intensity, distance,
 * priority, kind, flicker? }. The renderer keeps a small pool of PointLights
 * and each tick binds the pool to the specs that matter most right now —
 * `rankSpecsForPosition` scores specs by distance to the camera with a bias
 * towards important kinds (ceiling fixtures over corridor lamps).
 * `flickerFactor` drives dying-fluorescent animation deterministically.
 */

/** Metres of "closeness credit" per unit of priority when ranking specs. */
export const LIGHT_PRIORITY_BIAS = 12;

/** Multiplier for a flickering light at `time` seconds. Returns ~0.04..1. */
export function flickerFactor(flicker, time) {
  if (!flicker) return 1;
  const n = Math.sin(time * flicker.speed + flicker.phase) * 0.6
    + Math.sin(time * flicker.speed * 2.7 + flicker.phase * 1.7) * 0.4;
  const level = 1 - flicker.depth * (n * 0.5 + 0.5);
  // Occasional hard dropout when both sines peak: the lamp is dying.
  const dropout = n > 0.9 ? 0.3 : 1;
  return Math.max(0.04, level * dropout);
}

/**
 * Indices of the `count` most relevant specs for a camera position,
 * best first. Deterministic: equal scores keep generation order.
 */
export function rankSpecsForPosition(specs, position, count) {
  const scored = specs.map((spec, index) => {
    const dx = spec.position[0] - position.x;
    const dy = spec.position[1] - position.y;
    const dz = spec.position[2] - position.z;
    const score = Math.sqrt(dx * dx + dy * dy + dz * dz)
      - LIGHT_PRIORITY_BIAS * (spec.priority ?? 0.5);
    return { index, score };
  });
  scored.sort((a, b) => a.score - b.score || a.index - b.index);
  return scored.slice(0, Math.max(0, count)).map((entry) => entry.index);
}
