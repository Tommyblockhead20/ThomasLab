export const EMOTE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'wave', label: 'Wave', durationMs: 3200 }),
  Object.freeze({ id: 'point', label: 'Point', durationMs: 3000 }),
  Object.freeze({ id: 'cheer', label: 'Cheer', durationMs: 3300 }),
  Object.freeze({ id: 'sit', label: 'Sit / Relax', durationMs: 8000 }),
  Object.freeze({ id: 'dance', label: 'Dance', durationMs: 4800 })
]);

export const EMOTE_IDS = Object.freeze(EMOTE_DEFINITIONS.map((emote) => emote.id));

export function normalizeEmote(value) {
  if (!value) return null;
  const source = typeof value === 'string' ? { id: value } : value;
  if (!EMOTE_IDS.includes(source?.id)) return null;
  return {
    id: source.id,
    startedAt: Number.isFinite(Number(source.startedAt)) ? Number(source.startedAt) : Date.now()
  };
}

export function emoteDurationMs(id) {
  return EMOTE_DEFINITIONS.find((emote) => emote.id === id)?.durationMs ?? 0;
}
