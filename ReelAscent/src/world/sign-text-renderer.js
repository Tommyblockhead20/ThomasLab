import * as pc from 'playcanvas';

const normalizeSignText = (value, fallback = 'SIGN') => (
  String(value ?? fallback).trim().slice(0, 48).toUpperCase() || fallback
);

// Shared by the production world and World Editor. Keeping the canvas/material creation in
// runtime source prevents the editor from promising lettering that the shipped game never
// constructs.
export function attachSignText(device, parent, value, options = {}) {
  if (!device || !parent || typeof document === 'undefined') return null;
  const text = normalizeSignText(value, options.fallback ?? 'SIGN');
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = options.color ?? '#f8e7aa';
  context.strokeStyle = options.outlineColor ?? '#0b1b19';
  context.lineWidth = 7;
  const fontSize = Math.max(28, Math.min(62, Math.floor(490 / Math.max(4, text.length) * 1.75)));
  context.font = `900 ${fontSize}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.strokeText(text, 256, 67, 486);
  context.fillText(text, 256, 67, 486);

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

  const label = new pc.Entity(`${parent.name || 'Sign'} text`);
  label._editorBaseMaterial = material;
  label.addComponent('render', { type: 'box', material, castShadows: false, receiveShadows: false });
  parent.addChild(label);
  label.setLocalPosition(0, 0, options.surfaceOffset ?? .53);
  label.setLocalScale(options.widthScale ?? .92, options.heightScale ?? .72, .025);
  parent._editorOwnedSignTextures = [...(parent._editorOwnedSignTextures ?? []), texture];
  parent._editorOwnedSignMaterials = [...(parent._editorOwnedSignMaterials ?? []), material];
  return label;
}

