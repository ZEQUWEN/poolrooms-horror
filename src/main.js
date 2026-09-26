import './styles.css';
import { SettingsStore, QUALITY_PROFILES } from './settings.js';
import { GameEngine } from './scene.js';

const settings = new SettingsStore();
const engine = new GameEngine(document.querySelector('#game-canvas'), settings);
const { player } = engine;

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
playButton.addEventListener('click', () => {
  setSettingsOpen(false);
  player.lock();
});

// Pointer lock drives the pause flow. The browser releases the lock on Esc.
player.controls.addEventListener('lock', () => {
  mainMenu.classList.add('is-hidden');
  body.classList.add('is-playing');
  menuHint.textContent = DEFAULT_HINT;
});

player.controls.addEventListener('unlock', () => {
  mainMenu.classList.remove('is-hidden');
  body.classList.remove('is-playing');
  playButton.textContent = 'Resume';
});

document.addEventListener('pointerlockerror', () => {
  menuHint.textContent = 'The browser blocked mouse capture. Wait one second, then click Resume again.';
});

player.addEventListener('statechange', (event) => updatePlayerState(event.detail));
updatePlayerState(player.getSnapshot());

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && settingsPanel.classList.contains('is-open')) setSettingsOpen(false);
});

if (import.meta.env.DEV) window.poolrooms = engine;
