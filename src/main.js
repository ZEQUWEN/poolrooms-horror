import './styles.css';
import { SettingsStore, QUALITY_PROFILES } from './settings.js';
import { PoolroomsPreview } from './scene.js';

const settings = new SettingsStore();
new PoolroomsPreview(document.querySelector('#game-canvas'), settings);

const mainMenu = document.querySelector('#main-menu');
const settingsPanel = document.querySelector('#settings-panel');
const qualityIndicator = document.querySelector('#quality-indicator');
const qualityDescription = document.querySelector('#quality-description');
const controls = document.querySelectorAll('[data-setting]');

function setSettingsOpen(isOpen) {
  settingsPanel.classList.toggle('is-open', isOpen);
  settingsPanel.setAttribute('aria-hidden', String(!isOpen));
}

function updateForm(values) {
  controls.forEach((control) => { control.value = values[control.dataset.setting]; });
  document.querySelector('#master-value').value = `${values.masterVolume}%`;
  document.querySelector('#ambient-value').value = `${values.ambientVolume}%`;
  document.querySelector('#sfx-value').value = `${values.sfxVolume}%`;
  const profile = QUALITY_PROFILES[values.quality];
  qualityDescription.textContent = profile.description;
  qualityIndicator.textContent = profile.label.toUpperCase();
}

settings.subscribe((values) => updateForm(values));
controls.forEach((control) => control.addEventListener('input', (event) => {
  const { setting } = event.currentTarget.dataset;
  const value = setting === 'quality' ? event.currentTarget.value : Number(event.currentTarget.value);
  settings.set(setting, value);
}));

document.querySelector('#settings-button').addEventListener('click', () => setSettingsOpen(true));
document.querySelector('#close-settings').addEventListener('click', () => setSettingsOpen(false));
document.querySelector('#play-button').addEventListener('click', () => {
  mainMenu.classList.add('is-hidden');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    mainMenu.classList.remove('is-hidden');
    setSettingsOpen(false);
  }
});
