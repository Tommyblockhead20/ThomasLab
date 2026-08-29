import { EQUIPMENT_BY_ID } from './equipment.js';
import { normalizeProgressionState } from './progression-save.js';
import { SAVE_SCHEMA_VERSION, normalizeSave } from '../persistence/save-system.js';

export const PROGRESS_EXPORT_FORMAT = 'reel-ascent-progress';
export const PROGRESS_EXPORT_VERSION = 1;
const MAX_SPECIMENS = 2000;
const MAX_COLLECTION_ENTRIES = 2000;

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createProgressExport(saveSnapshot) {
  const save = normalizeSave(saveSnapshot);
  return {
    format: PROGRESS_EXPORT_FORMAT,
    exportVersion: PROGRESS_EXPORT_VERSION,
    schemaVersion: SAVE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    player: copy(save.progression.player),
    progression: {
      collection: copy(save.collection),
      lifetime: copy(save.lifetime),
      runHistory: copy(save.runHistory),
      economy: copy(save.progression)
    }
  };
}

export function serializeProgress(saveSnapshot) {
  return JSON.stringify(createProgressExport(saveSnapshot), null, 2);
}

function parseDocument(input) {
  if (typeof input === 'string') {
    if (input.length > 8_000_000) throw new Error('Progress file is too large.');
    try { return JSON.parse(input); } catch { throw new Error('Progress data is not valid JSON.'); }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Progress data must be an object.');
  return copy(input);
}

export function validateProgressImport(input) {
  const document = parseDocument(input);
  if (document.format !== PROGRESS_EXPORT_FORMAT) throw new Error('This is not a Reel Ascent progress export.');
  if (document.exportVersion !== PROGRESS_EXPORT_VERSION) throw new Error(`Unsupported progress export version: ${document.exportVersion}.`);
  if (!Number.isInteger(document.schemaVersion) || document.schemaVersion < 1 || document.schemaVersion > SAVE_SCHEMA_VERSION) {
    throw new Error(`Unsupported save schema version: ${document.schemaVersion}.`);
  }
  if (!document.player || typeof document.player.id !== 'string' || !document.player.id.trim()) {
    throw new Error('The export is missing a durable player ID.');
  }
  const portable = document.progression;
  if (!portable || typeof portable !== 'object' || Array.isArray(portable)) throw new Error('The export is missing progression data.');
  const collectionCount = portable.collection && typeof portable.collection === 'object'
    ? Object.keys(portable.collection).length
    : 0;
  if (collectionCount > MAX_COLLECTION_ENTRIES) throw new Error('The collection contains too many entries.');
  const economy = portable.economy;
  if (!economy || typeof economy !== 'object' || Array.isArray(economy)) throw new Error('The export is missing economy data.');
  if (!Number.isFinite(economy.money) || economy.money < 0) throw new Error('Money must be a finite nonnegative number.');
  if ((economy.inventory?.length ?? 0) > MAX_SPECIMENS || (economy.aquarium?.length ?? 0) > MAX_SPECIMENS) {
    throw new Error('The export contains too many specimen records.');
  }

  const knownOwned = Array.isArray(economy.ownedEquipment)
    ? economy.ownedEquipment.filter((id) => typeof id === 'string' && EQUIPMENT_BY_ID.has(id))
    : [];
  const normalizedEconomy = normalizeProgressionState({
    ...economy,
    player: document.player,
    ownedEquipment: knownOwned,
    equipped: Object.fromEntries(
      Object.entries(economy.equipped ?? {}).filter(([, id]) => knownOwned.includes(id) && EQUIPMENT_BY_ID.has(id))
    )
  });
  const normalizedSave = normalizeSave({
    version: document.schemaVersion,
    collection: portable.collection,
    lifetime: portable.lifetime,
    runHistory: portable.runHistory,
    progression: normalizedEconomy
  });
  return {
    document: createProgressExport(normalizedSave),
    save: normalizedSave,
    summary: {
      playerId: normalizedSave.progression.player.id,
      discovered: Object.values(normalizedSave.collection).filter((entry) => entry.discovered).length,
      inventory: normalizedSave.progression.inventory.length,
      aquarium: normalizedSave.progression.aquarium.length,
      money: normalizedSave.progression.money
    }
  };
}
