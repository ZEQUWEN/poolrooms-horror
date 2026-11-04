import { applyLookDelta, joystickAxis } from './lookMath.js';

export const JOYSTICK_RADIUS = 58;

export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0;
}

/**
 * Smartphone controls:
 *  - left half of the screen: floating virtual joystick (move / wade);
 *  - right half: drag to look around;
 *  - CROUCH button toggles crouch (needed to dive under the surface);
 *  - pause button returns to the menu.
 *
 * Pointer Events are used, so a stylus or a mouse on a touch laptop also
 * works while the controls are active.
 */
export class TouchControls extends EventTarget {
  constructor(player) {
    super();
    this.player = player;
    this.active = false;
    this.movePointer = null;
    this.lookPointer = null;
    this.lookLast = null;

    this.ui = {
      root: document.querySelector('#touch-ui'),
      move: document.querySelector('#zone-move'),
      look: document.querySelector('#zone-look'),
      base: document.querySelector('#stick-base'),
      knob: document.querySelector('#stick-knob'),
      crouch: document.querySelector('#btn-crouch'),
      pause: document.querySelector('#btn-pause')
    };

    this.ui.move.addEventListener('pointerdown', (event) => this.startMove(event));
    this.ui.move.addEventListener('pointermove', (event) => this.updateMove(event));
    this.ui.move.addEventListener('pointerup', (event) => this.endMove(event));
    this.ui.move.addEventListener('pointercancel', (event) => this.endMove(event));

    this.ui.look.addEventListener('pointerdown', (event) => this.startLook(event));
    this.ui.look.addEventListener('pointermove', (event) => this.updateLook(event));
    this.ui.look.addEventListener('pointerup', (event) => this.endLook(event));
    this.ui.look.addEventListener('pointercancel', (event) => this.endLook(event));

    this.ui.crouch.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.player.input.crouch = !this.player.input.crouch;
      this.ui.crouch.classList.toggle('is-on', this.player.input.crouch);
    });
    this.ui.pause.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.deactivate();
    });
  }

  activate() {
    if (this.active) return;
    this.active = true;
    document.body.classList.add('touch-active');
    this.ui.root.setAttribute('aria-hidden', 'false');
    this.player.setMobileActive(true);
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;
    document.body.classList.remove('touch-active');
    this.ui.root.setAttribute('aria-hidden', 'true');
    this.ui.crouch.classList.remove('is-on');
    this.hideStick();
    this.movePointer = null;
    this.lookPointer = null;
    this.player.setMobileActive(false);
  }

  startMove(event) {
    if (this.movePointer !== null) return;
    event.preventDefault();
    this.movePointer = event.pointerId;
    this.origin = { x: event.clientX, y: event.clientY };
    this.ui.base.style.left = `${event.clientX}px`;
    this.ui.base.style.top = `${event.clientY}px`;
    this.ui.base.classList.add('is-on');
    this.setKnob(0, 0);
  }

  updateMove(event) {
    if (event.pointerId !== this.movePointer) return;
    event.preventDefault();
    const dx = event.clientX - this.origin.x;
    const dy = event.clientY - this.origin.y;
    const axis = joystickAxis(dx, dy, JOYSTICK_RADIUS);
    this.player.input.axis.x = axis.x;
    this.player.input.axis.y = axis.y;
    this.setKnob(axis.x * JOYSTICK_RADIUS, -axis.y * JOYSTICK_RADIUS);
  }

  endMove(event) {
    if (event.pointerId !== this.movePointer) return;
    this.movePointer = null;
    this.player.input.axis.x = 0;
    this.player.input.axis.y = 0;
    this.hideStick();
  }

  setKnob(x, y) {
    this.ui.knob.style.transform = `translate(${x}px, ${y}px)`;
  }

  hideStick() {
    this.ui.base.classList.remove('is-on');
    this.setKnob(0, 0);
  }

  startLook(event) {
    if (this.lookPointer !== null) return;
    event.preventDefault();
    this.lookPointer = event.pointerId;
    this.lookLast = { x: event.clientX, y: event.clientY };
  }

  updateLook(event) {
    if (event.pointerId !== this.lookPointer) return;
    event.preventDefault();
    const dx = event.clientX - this.lookLast.x;
    const dy = event.clientY - this.lookLast.y;
    this.lookLast = { x: event.clientX, y: event.clientY };
    this.player.applyLook(applyLookDelta(this.player.look, dx, dy));
  }

  endLook(event) {
    if (event.pointerId !== this.lookPointer) return;
    this.lookPointer = null;
  }
}
