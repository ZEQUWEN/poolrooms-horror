import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const KEY_BINDINGS = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyC: 'crouch',
  ControlLeft: 'crouch'
};

export const PLAYER_CONFIG = Object.freeze({
  radius: 0.35,
  standEyeHeight: 1.65,
  crouchEyeHeight: 0.95,
  walkSpeed: 3.4,
  crouchSpeed: 1.7,
  wadingSpeedFactor: 0.55,
  submergedSpeedFactor: 0.4,
  groundAcceleration: 12,
  waterAcceleration: 3.5,
  gravity: 22,
  waterGravity: 3.2,
  waterDrag: 2.8,
  stepHeight: 0.5,
  crouchSharpness: 10,
  waterEntryMargin: 0.05
});

/**
 * First-person controller.
 * - Mouse look through PointerLockControls.
 * - WASD / arrow movement with acceleration smoothing.
 * - Crouch with a damped (lerped) eye height.
 * - Gravity, step-up, and collision against the room layout.
 * - Aquatic state when the feet are below the water surface.
 *
 * Dispatches `statechange` with { state, submerged, waterDepth }.
 */
export class PlayerController extends EventTarget {
  constructor(camera, domElement, world, spawn = new THREE.Vector3(0, 0, 9)) {
    super();
    this.camera = camera;
    this.world = world;
    this.waterAtFeet = null;
    this.controls = new PointerLockControls(camera, domElement);
    this.controls.pointerSpeed = 0.85;
    camera.rotation.order = 'YXZ';

    this.input = { forward: false, backward: false, left: false, right: false, crouch: false, axis: { x: 0, y: 0 } };
    this.look = { yaw: 0, pitch: 0 };
    this.mobileActive = false;
    this.feet = spawn.clone();
    this.floor = spawn.floor ?? 0;
    this.velocity = new THREE.Vector3();
    this.eyeHeight = PLAYER_CONFIG.standEyeHeight;
    this.state = 'grounded';
    this.submerged = false;

    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.wish = new THREE.Vector3();
    this.probe = new THREE.Vector3();

    this.syncCamera();
    this.camera.lookAt(0, 0.2, -2);

    document.addEventListener('keydown', (event) => this.handleKey(event, true));
    document.addEventListener('keyup', (event) => this.handleKey(event, false));
    this.controls.addEventListener('unlock', () => this.clearInput());
    window.addEventListener('blur', () => this.clearInput());
  }

  get isLocked() {
    return this.controls.isLocked;
  }

  /** True while gameplay input is live: pointer lock on desktop, touch UI on phones. */
  get isActive() {
    return this.controls.isLocked || this.mobileActive;
  }

  /** Touch mode on/off: syncs the look euler with the current camera pose. */
  setMobileActive(on) {
    this.mobileActive = on;
    if (on) {
      const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.look.yaw = euler.y;
      this.look.pitch = euler.x;
    } else {
      this.clearInput();
    }
    this.dispatchEvent(new CustomEvent('playmode', { detail: { playing: on } }));
  }

  /** Apply a yaw/pitch state (from lookMath.applyLookDelta). */
  applyLook(look) {
    this.look.yaw = look.yaw;
    this.look.pitch = look.pitch;
    this.camera.rotation.set(this.look.pitch, this.look.yaw, 0);
  }

  lock() {
    this.controls.lock();
  }

  getSnapshot() {
    const level = this.waterAtFeet ? this.waterAtFeet.level : 0;
    return { state: this.state, submerged: this.submerged, waterDepth: Math.max(0, level - this.feet.y), floor: this.floor };
  }

  handleKey(event, pressed) {
    const action = KEY_BINDINGS[event.code];
    if (!action) return;
    if (!this.isActive) {
      this.input[action] = false;
      return;
    }
    event.preventDefault();
    this.input[action] = pressed;
  }

  clearInput() {
    for (const key of Object.keys(this.input)) this.input[key] = false;
  }

  update(delta, elapsed) {
    const dt = Math.min(delta, 0.05);
    const config = PLAYER_CONFIG;
    this.waterAtFeet = this.world.getWaterState(this.feet.x, this.feet.z, elapsed, this.floor);
    const inWater = this.waterAtFeet !== null && this.feet.y < this.waterAtFeet.level - config.waterEntryMargin;
    const crouching = this.isActive && this.input.crouch;

    // Movement direction on the horizontal plane, relative to the view yaw.
    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() > 0) this.forward.normalize();
    this.right.crossVectors(this.forward, this.camera.up).normalize();

    this.wish.set(0, 0, 0);
    if (Math.abs(this.input.axis.x) > 0.001 || Math.abs(this.input.axis.y) > 0.001) {
      // Analog touch joystick: blend forward/right vectors, clamp to unit length.
      this.wish.addScaledVector(this.forward, this.input.axis.y);
      this.wish.addScaledVector(this.right, this.input.axis.x);
      if (this.wish.lengthSq() > 1) this.wish.normalize();
    } else {
      if (this.input.forward) this.wish.add(this.forward);
      if (this.input.backward) this.wish.sub(this.forward);
      if (this.input.right) this.wish.add(this.right);
      if (this.input.left) this.wish.sub(this.right);
      if (this.wish.lengthSq() > 0) this.wish.normalize();
    }

    let speed = crouching ? config.crouchSpeed : config.walkSpeed;
    if (this.submerged) speed *= config.submergedSpeedFactor;
    else if (inWater) speed *= config.wadingSpeedFactor;

    // Water resistance: slower acceleration makes movement feel heavy.
    const acceleration = inWater ? config.waterAcceleration : config.groundAcceleration;
    const blend = 1 - Math.exp(-acceleration * dt);
    this.velocity.x += (this.wish.x * speed - this.velocity.x) * blend;
    this.velocity.z += (this.wish.z * speed - this.velocity.z) * blend;

    this.moveAxis('x', this.velocity.x * dt);
    this.moveAxis('z', this.velocity.z * dt);

    // Vertical motion: reduced gravity and drag in water.
    this.velocity.y -= (inWater ? config.waterGravity : config.gravity) * dt;
    if (inWater) this.velocity.y *= Math.exp(-config.waterDrag * dt);
    this.feet.y += this.velocity.y * dt;

    const ground = this.world.getGroundHeight(this.feet.x, this.feet.z, this.floor);
    if (this.feet.y <= ground) {
      this.feet.y = ground;
      this.velocity.y = 0;
    }

    // Vertical connectors: stair hatches up and floor hatches down.
    const connector = this.world.checkVertical(this.floor, this.feet.x, this.feet.z, this.feet.y);
    if (connector) {
      this.floor = connector.toFloor;
      this.feet.set(connector.to.x, connector.to.y, connector.to.z);
      this.velocity.set(0, 0, 0);
      this.dispatchEvent(new CustomEvent('floorchange', { detail: { floor: this.floor, type: connector.type } }));
    }

    const targetEye = crouching ? config.crouchEyeHeight : config.standEyeHeight;
    this.eyeHeight = THREE.MathUtils.damp(this.eyeHeight, targetEye, config.crouchSharpness, dt);

    this.syncCamera();
    this.updateWaterState(elapsed);
  }

  moveAxis(axis, amount) {
    if (Math.abs(amount) < 1e-7) return;
    const { radius, stepHeight } = PLAYER_CONFIG;

    this.probe.copy(this.feet);
    this.probe[axis] += amount;

    // Exact disk test against the level union: walls, pillars and seams.
    if (!this.world.canStand(this.probe.x, this.probe.z, radius, this.floor)) {
      this.velocity[axis] = 0;
      return;
    }

    // Check the ground at the leading edge of the player body, so basin
    // walls seen from inside the water block early.
    const leadOffset = Math.sign(amount) * radius;
    const leadX = axis === 'x' ? this.probe.x + leadOffset : this.probe.x;
    const leadZ = axis === 'z' ? this.probe.z + leadOffset : this.probe.z;
    if (this.world.getGroundHeight(leadX, leadZ, this.floor) - this.feet.y > stepHeight) {
      this.velocity[axis] = 0;
      return;
    }

    this.feet.x = this.probe.x;
    this.feet.z = this.probe.z;

    const centerGround = this.world.getGroundHeight(this.feet.x, this.feet.z, this.floor);
    if (centerGround > this.feet.y) {
      this.feet.y = centerGround;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }
  }

  syncCamera() {
    const offset = this.world.floorOffset ? this.world.floorOffset(this.floor) : 0;
    this.camera.position.set(this.feet.x, this.feet.y + this.eyeHeight + offset, this.feet.z);
  }

  updateWaterState(elapsed) {
    const { position } = this.camera;
    const atCamera = this.world.getWaterState(position.x, position.z, elapsed, this.floor);
    const surface = atCamera ? atCamera.surface : null;
    const aquatic = this.waterAtFeet !== null && this.feet.y < this.waterAtFeet.level - PLAYER_CONFIG.waterEntryMargin;
    const submerged = aquatic && surface !== null && position.y < surface;
    const state = aquatic ? 'aquatic' : 'grounded';

    if (state === this.state && submerged === this.submerged) return;
    this.state = state;
    this.submerged = submerged;
    this.dispatchEvent(new CustomEvent('statechange', { detail: this.getSnapshot() }));
  }
}
