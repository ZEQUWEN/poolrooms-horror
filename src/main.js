import './styles.css';
import { SettingsStore, QUALITY_PROFILES } from './settings.js';
import { GameEngine } from './scene.js';
import { TouchControls, isTouchDevice } from './player/TouchControls.js';

const settings = new SettingsStore();
const engine = new GameEngine(document.querySelector('#game-canvas'), settings);
const { player } = engine;

document.querySelector('#seed-line').textContent =
  `Sector seed ${engine.seed} — replay this exact layout with ?seed=${engine.seed}`;

if (touchMode) {
  // iOS pinch/zoom gestures must not interrupt play.
  for (const gesture of ['gesturestart', 'gesturechange']) {
    document.addEventListener(gesture, (event) => event.preventDefault());
  }
  document.addEventListener('dblclick', (event) => event.preventDefault());
}

const transitionOverlay = document.querySelector('#transition-overlay');
const floorIndicator = document.querySelector('#hud-floor');
player.addEventListener('floorchange', (event) => {
  floorIndicator.textContent = `37.${event.detail.floor}`;
  transitionOverlay.classList.add('is-active');
  window.setTimeout(() => transitionOverlay.classList.remove('is-active'), 240);
});

const body = document.body;
const mainMenu = document.querySelector('#main-menu');
const settingsPanel = document.querySelector('#settings-panel');
const playButton = document.querySelector('#play-button');
const menuHint = document.querySelector('#menu-hint');
const stateIndicator = document.querySelector('#player-state');
const qualityIndicator = document.querySelector('#quality-indicator');
const qualityDescription = document.querySelector('#quality-description');
const controls = document.querySelectorAll('[data-setting]');
const DEFAULT_HINT = menuHint.textContent;
const STATE_LABELS = { grounded: 'GROUNDED', aquatic: 'WADING' };

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

settings.subscribe(updateForm);
controls.forEach((control) => control.addEventListener('input', (event) => {
  const { setting } = event.currentTarget.dataset;
  const value = setting === 'quality' ? event.currentTarget.value : Number(event.currentTarget.value);
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

// Touch devices get a virtual joystick instead of pointer lock.
const touchMode = isTouchDevice();
let touchControls = null;
if (touchMode) {
  body.classList.add('has-touch');
  touchControls = new TouchControls(player, settings);
  touchControls.addEventListener('pause', () => touchControls.deactivate());
}

playButton.addEventListener('click', () => {
  setSettingsOpen(false);
  if (touchMode) touchControls.activate();
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
