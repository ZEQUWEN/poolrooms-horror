const STORAGE_KEY = 'poolrooms.settings';

export const QUALITY_PROFILES = {
  low: {
    label: 'Low',
    pixelRatio: 1,
    shadowMapSize: 512,
    fogDensity: 0.075,
    dynamicFog: false,
    description: '512 px shadows. Static dense fog. Best performance.'
  },
  medium: {
    label: 'Medium',
    pixelRatio: 1.5,
    shadowMapSize: 1024,
    fogDensity: 0.052,
    dynamicFog: true,
    description: '1024 px shadows. Gentle moving fog. Balanced quality.'
  },
  high: {
    label: 'High',
    pixelRatio: 2,
    shadowMapSize: 2048,
    fogDensity: 0.035,
    dynamicFog: true,
    description: '2048 px shadows. Rich moving fog. Higher GPU cost.'
  }
};

const defaults = { masterVolume: 80, ambientVolume: 65, sfxVolume: 75, quality: 'medium' };

export class SettingsStore {
  constructor() {
    this.listeners = new Set();
    this.values = this.load();
  }

  load() {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
    } catch {
      return { ...defaults };
    }
  }

  set(key, value) {
    this.values[key] = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    this.listeners.forEach((listener) => listener(this.values, key));
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.values, null);
    return () => this.listeners.delete(listener);
  }
}
