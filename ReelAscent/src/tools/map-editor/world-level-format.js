import {
  WORLD_EDITOR_LEVEL_KIND,
  WORLD_EDITOR_LEVEL_SCHEMA,
  makeWorldEditorLevel,
  normalizeWorldEditorLevel,
  wrapLegacyStoneveilPatch,
  unwrapLegacyStoneveilPatch
} from '../../src/world/world-editor-v2-runtime.js';

export { WORLD_EDITOR_LEVEL_KIND, WORLD_EDITOR_LEVEL_SCHEMA, makeWorldEditorLevel, normalizeWorldEditorLevel, wrapLegacyStoneveilPatch, unwrapLegacyStoneveilPatch };

export function nextStableId(level, prefix) {
  const ids = new Set([
    ...(level.objects ?? []).map((item) => item.id),
    ...(level.movingPlatforms ?? []).map((item) => item.id),
    ...(level.prefabs?.definitions ?? []).map((item) => item.id),
    ...(level.prefabs?.instances ?? []).map((item) => item.id),
    ...(level.rooms ?? []).map((item) => item.id)
  ].filter(Boolean).map(String));
  for (let sequence = 1; sequence < 1000000; sequence += 1) {
    const candidate = `${prefix}-${String(sequence).padStart(4, '0')}`;
    if (!ids.has(candidate)) return candidate;
  }
  return `${prefix}-${Date.now()}`;
}

export function downloadWorldLevel(level, filename = null) {
  const name = filename || `${level.worldId || 'world'}-world-editor-v2.json`;
  const blob = new Blob([JSON.stringify(level, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}
