import { attachSignText } from '../../src/world/sign-text-renderer.js';

const normalize = (value, fallback = '') => String(value ?? fallback).trim().slice(0, 48);

export function supportsEditableSignText(record) {
  if (!record) return false;
  if (record.metadata?.editableSign === true || record.metadata?.signText != null) return true;
  if (record.decorKind === 'sign') return true;
  const name = String(record.name || '').trim();
  if (/\bsign\s+(rope|hook|letter)\b/i.test(name)) return false;
  return /\bsign\b/i.test(name) || String(record.type || '').toLowerCase() === 'sign';
}

export function editableSignText(record) {
  const explicit = normalize(record?.metadata?.signText ?? record?.signText);
  if (explicit) return explicit;
  if (record?.decorKind === 'sign') return 'TRAIL';
  return normalize(record?.name, 'SIGN').replace(/\s+sign$/i, '').replace(/^trail cabin\s+/i, '').toUpperCase();
}

export function attachEditorSignText(device, parent, record) {
  if (!device || !parent || !supportsEditableSignText(record)) return null;
  return attachSignText(device, parent, editableSignText(record));
}
