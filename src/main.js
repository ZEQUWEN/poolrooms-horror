import './styles.css';
import { SettingsStore, QUALITY_PROFILES, CONTROL_SCHEME_DESCRIPTIONS, resolveControlScheme } from './settings.js';
import { GameEngine } from './scene.js';
import { TouchControls, isTouchDevice } from './player/TouchControls.js';

const settings = new SettingsStore();
const engine = new GameEngine(document.querySelector('#game-canvas'), settings);
const { player } = engine;

document.querySelector('#seed-line').textContent =
  `Sector seed ${engine.seed} — replay this exact layout with ?seed=${engine.seed}`;

const body = document.body;
const mainMenu = document.querySelector('#main-menu');
const settingsPanel = document.querySelector('#settings-panel');
const playButton = document.querySelector('#play-button');
const menuHint = document.querySelector('#menu-hint');
const stateIndicator = document.querySelector('#player-state');
const qualityIndicator = document.querySelector('#quality-indicator');
const qualityDescription = document.querySelector('#quality-description');
const controlsDescription = document.querySelector('#controls-description');
const controls = document.querySelectorAll('[data-setting]');
const DEFAULT_HINT = menuHint.textContent;
const STATE_LABELS = { grounded: 'GROUNDED', aquatic: 'WADING' };

// iOS pinch/zoom gestures must not interrupt play on touch-capable hardware.
const touchCapable = isTouchDevice();
if (touchCapable) {
  for (const gesture of ['gesturestart', 'gesturechange']) {
    document.addEventListener(gesture, (event) => event.preventDefault());
  }
  document.addEventListener('dblclick', (event) => event.preventDefault());
}

/* ------------------------------------------------- control scheme switching */

let activeScheme = resolveControlScheme(settings.values.controlScheme, touchCapable);
let touchControls = null;

function ensureTouchControls() {
  if (!touchControls) {
    touchControls = new TouchControls(player, settings);
    touchControls.addEventListener('pause', () => touchControls.deactivate());
  }
  return touchControls;
}

/**
 * Applies the effective scheme ('desktop' | 'touch'). Settings can force the
 * mobile layout on a PC or the keyboard+mouse layout on a phone; 'auto'
 * follows the device. Switching live toggles the touch UI and releases it.
 */
function applyControlScheme(value) {
  activeScheme = resolveControlScheme(value, touchCapable);
  const touch = activeScheme === 'touch';
  body.classList.toggle('has-touch', touch);
  if (touch) ensureTouchControls();
  else if (touchControls?.active) touchControls.deactivate();
  controlsDescription.textContent = CONTROL_SCHEME_DESCRIPTIONS[activeScheme];
}

/* ------------------------------------------------------------------- menu */

const transitionOverlay = document.querySelector('#transition-overlay');
const floorIndicator = document.querySelector('#hud-floor');
player.addEventListener('floorchange', (event) => {
  floorIndicator.textContent = `37.${event.detail.floor}`;
  transitionOverlay.classList.add('is-active');
  window.setTimeout(() => transitionOverlay.classList.remove('is-active'), 240);
});

function setSettingsOpen(isOpen) {
  settingsPanel.classList.toggle('is-open', isOpen);
  settingsPanel.setAttribute('aria-hidden', String(!isOpen));
}

function updateForm(values) {
  controls.forEach((control) => { control.value = values[control.dataset.setting]; });
  document.querySelector('#master-value').value = `${values.masterVolume}%`;
  document.querySelector('#ambient-value').value = `${values.ambientVolume}%`;
  document.querySelector('#sfx-value').value = `${values.sfxVolume}%`;
  document.querySelector('#touch-value').value = `${values.touchSensitivity}%`;
  const profile = QUALITY_PROFILES[values.quality] ?? QUALITY_PROFILES.medium;
  qualityDescription.textContent = profile.description;
  qualityIndicator.textContent = profile.label.toUpperCase();
}

function updatePlayerState({ state, submerged }) {
  stateIndicator.textContent = submerged ? 'SUBMERGED' : STATE_LABELS[state];
  body.dataset.playerState = state;
  body.classList.toggle('is-submerged', submerged);
}

settings.subscribe((values, changedKey) => {
  updateForm(values);
  if (changedKey === 'controlScheme' || changedKey === null) applyControlScheme(values.controlScheme);
});

controls.forEach((control) => control.addEventListener('input', (event) => {
  const { setting } = event.currentTarget.dataset;
  // Sliders store numbers; selects (quality, control scheme) store strings.
  const value = event.currentTarget.type === 'range'
    ? Number(event.currentTarget.value)
    : event.currentTarget.value;
  settings.set(setting, value);
}));

document.querySelector('#settings-button').addEventListener('click', () => setSettingsOpen(true));
document.querySelector('#close-settings').addEventListener('click', () => setSettingsOpen(false));

function setPlaying(isPlaying) {
  mainMenu.classList.toggle('is-hidden', isPlaying);
  body.classList.toggle('is-playing', isPlaying);
  if (isPlaying) menuHint.textContent = DEFAULT_HINT;
  else playButton.textContent = 'Resume';
}

playButton.addEventListener('click', () => {
  setSettingsOpen(false);
  if (activeScheme === 'touch') ensureTouchControls().activate();
  else player.lock();
});

// Pointer lock drives the pause flow on desktop. The browser releases on Esc.
player.controls.addEventListener('lock', () => setPlaying(true));
player.controls.addEventListener('unlock', () => setPlaying(false));
player.addEventListener('playmode', (event) => setPlaying(event.detail.playing));

document.addEventListener('pointerlockerror', () => {
  menuHint.textContent = 'The browser blocked mouse capture. Wait one second, then click Resume again.';
});

player.addEventListener('statechange', (event) => updatePlayerState(event.detail));
updatePlayerState(player.getSnapshot());

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && settingsPanel.classList.contains('is-open')) setSettingsOpen(false);
});

if (import.meta.env.DEV) window.poolrooms = engine;
