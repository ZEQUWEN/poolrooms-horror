/**
 * Pure camera-look math shared by the touch controls (and testable in Node).
 * Yaw/pitch are stored as a YXZ euler: yaw+ turns left, pitch+ looks up,
 * which matches three.js PointerLockControls' internal convention.
 */
export const PITCH_LIMIT = 1.45; // ~83 degrees, avoids gimbal flip
export const TOUCH_LOOK_SENSITIVITY = 0.0038; // radians per screen pixel

export function clampPitch(pitch) {
  return Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
}

/** Screen-space drag delta (pixels) to yaw/pitch. Drag right looks right,
 *  drag up looks up. */
export function applyLookDelta(look, dx, dy, sensitivity = TOUCH_LOOK_SENSITIVITY) {
  return {
    yaw: look.yaw - dx * sensitivity,
    pitch: clampPitch(look.pitch - dy * sensitivity)
  };
}

/** Joystick pixel delta (knob - base) to a clamped analog axis in [-1, 1].
 *  Pushing the knob up (dy < 0) means forward (+y). */
export function joystickAxis(dx, dy, radius) {
  const length = Math.hypot(dx, dy);
  const scale = length > radius ? radius / length : 1;
  const x = (dx * scale) / radius;
  const y = (-dy * scale) / radius;
  // Small dead zone so a resting thumb does not drift.
  const magnitude = Math.hypot(x, y);
  if (magnitude < 0.08) return { x: 0, y: 0, magnitude: 0 };
  return { x, y, magnitude: Math.min(1, magnitude) };
}
