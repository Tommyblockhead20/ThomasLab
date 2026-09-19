import * as pc from 'playcanvas';

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
  const text = editableSignText(record);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#f8e7aa';
  context.strokeStyle = '#0b1b19';
  context.lineWidth = 7;
  const fontSize = Math.max(28, Math.min(62, Math.floor(490 / Math.max(4, text.length) * 1.75)));
  context.font = `900 ${fontSize}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.strokeText(text.toUpperCase(), 256, 67, 486);
  context.fillText(text.toUpperCase(), 256, 67, 486);

  const texture = new pc.Texture(device, { width: canvas.width, height: canvas.height, mipmaps: true });
  texture.setSource(canvas);
  const material = new pc.StandardMaterial();
  material.diffuseMap = texture;
  material.emissiveMap = texture;
  material.emissive = new pc.Color(.62, .62, .62);
  material.opacityMap = texture;
  material.alphaTest = .08;
  material.cull = pc.CULLFACE_NONE;
  material.gloss = .08;
  material.update();

  const label = new pc.Entity(`${record.name || record.id || 'Sign'} editable text`);
  label._editorBaseMaterial = material;
  label.addComponent('render', { type: 'box', material, castShadows: false, receiveShadows: false });
  parent.addChild(label);
  label.setLocalPosition(0, 0, .53);
  label.setLocalScale(.92, .72, .025);
  parent._editorOwnedSignTextures = [...(parent._editorOwnedSignTextures ?? []), texture];
  parent._editorOwnedSignMaterials = [...(parent._editorOwnedSignMaterials ?? []), material];
  return label;
}
