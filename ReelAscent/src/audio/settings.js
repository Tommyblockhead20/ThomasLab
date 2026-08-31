const AUDIO_SETTINGS_KEY = 'reel-ascent-audio-settings-v1';

export const DEFAULT_AUDIO_SETTINGS = Object.freeze({
  master: 1,
  rhythm: .82,
  sfx: .9,
  ambient: .78
});

const clampVolume = (value, fallback = 1) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
};

function normalize(value = {}) {
  return {
    master: clampVolume(value.master, DEFAULT_AUDIO_SETTINGS.master),
    rhythm: clampVolume(value.rhythm, DEFAULT_AUDIO_SETTINGS.rhythm),
    sfx: clampVolume(value.sfx, DEFAULT_AUDIO_SETTINGS.sfx),
    ambient: clampVolume(value.ambient, DEFAULT_AUDIO_SETTINGS.ambient)
  };
}

function load() {
  try {
    return normalize(JSON.parse(globalThis.localStorage?.getItem(AUDIO_SETTINGS_KEY) ?? '{}'));
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

let current = load();

export function getAudioSettings() {
  return { ...current };
}

export function setAudioSettings(patch = {}) {
  current = normalize({ ...current, ...patch });
  try { globalThis.localStorage?.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(current)); } catch {}
  if (typeof CustomEvent === 'function') {
    globalThis.dispatchEvent?.(new CustomEvent('reel-ascent:audio-settings', { detail: getAudioSettings() }));
  }
  return getAudioSettings();
}

export function getAudioGain(category = 'sfx') {
  const channel = category === 'music' ? 'rhythm' : category;
  return current.master * (current[channel] ?? current.sfx);
}
