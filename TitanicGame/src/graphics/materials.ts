import * as THREE from 'three';

function woodTexture(deck: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 2048;
  const c = canvas.getContext('2d')!;
  let seed = deck ? 1937 : 1909;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const planks = deck ? 16 : 8,
    width = canvas.width / planks;
  for (let p = 0; p < planks; p++) {
    const tone = Math.floor(random() * 18);
    c.fillStyle = deck
      ? `rgb(${144 + tone},${112 + tone},${75 + tone})`
      : `rgb(${101 + tone},${58 + tone},${34 + tone})`;
    c.fillRect(p * width, 0, width, canvas.height);
    c.fillStyle = deck ? '#584b3a' : '#37271d';
    c.fillRect(p * width, 0, deck ? 2 : 3, canvas.height);
    for (let grain = 0; grain < 55; grain++) {
      const x = p * width + 3 + random() * (width - 6);
      c.strokeStyle = `rgba(${random() > 0.55 ? '235,204,151' : '45,29,19'},${0.025 + random() * 0.08})`;
      c.lineWidth = 0.5 + random();
      c.beginPath();
      c.moveTo(x, 0);
      for (let y = 0; y <= canvas.height; y += 100) c.lineTo(x + Math.sin(y * 0.009 + p) * 1.7, y);
      c.stroke();
    }
    for (let joint = -1; joint < 7; joint++) {
      const y = joint * 390 + (p % 3) * 130;
      c.fillStyle = deck ? '#6a533d' : '#38261b';
      c.fillRect(p * width, y, width, 2);
      c.fillStyle = '#33271b77';
      for (const dx of [7, width - 7]) {
        c.beginPath();
        c.arc(p * width + dx, y + 8, 1.4, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(deck ? 0.45 : 1, deck ? 0.1 : 1);
  texture.anisotropy = 8;
  return texture;
}

function metalFloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#78817b';
  c.fillRect(0, 0, 512, 512);
  let seed = 614;
  const grain = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 1400; i++) {
    c.fillStyle = `rgba(21,19,12,${0.02 + grain() * 0.1})`;
    c.beginPath();
    c.ellipse(
      grain() * 512,
      grain() * 512,
      1 + grain() * 18,
      1 + grain() * 4,
      grain() * Math.PI,
      0,
      Math.PI * 2,
    );
    c.fill();
  }
  for (let y = 0; y < 512; y += 16)
    for (let x = 0; x < 512; x += 16) {
      const offset = ((y / 16) % 2) * 8;
      c.strokeStyle = '#9ba29a';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x + offset + 2, y + 3);
      c.lineTo(x + offset + 7, y + 8);
      c.stroke();
      c.strokeStyle = '#505e58';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x + offset + 3, y + 5);
      c.lineTo(x + offset + 8, y + 10);
      c.stroke();
    }
  c.strokeStyle = '#45524e';
  c.lineWidth = 3;
  c.strokeRect(1, 1, 510, 510);
  for (const x of [9, 503])
    for (const y of [9, 503]) {
      c.fillStyle = '#333f39';
      c.beginPath();
      c.arc(x, y, 3, 0, Math.PI * 2);
      c.fill();
    }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(9, 30);
  texture.anisotropy = 8;
  return texture;
}

export function createShipMaterials() {
  const teak = woodTexture(true),
    mahogany = woodTexture(false),
    tread = metalFloorTexture();
  const paint = (color: number, metalness = 0, roughness = 0.7) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x729aa9,
    roughness: 0.13,
    metalness: 0.12,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
    envMapIntensity: 0.55,
  });
  const glow = new THREE.MeshStandardMaterial({
    color: 0xf5cb8d,
    emissive: 0xffb85e,
    emissiveIntensity: 2.3,
    roughness: 0.4,
  });
  const palette = {
    wood: new THREE.MeshStandardMaterial({
      color: 0xc4a37d,
      map: mahogany,
      bumpMap: mahogany,
      bumpScale: 0.012,
      roughness: 0.52,
    }),
    darkWood: new THREE.MeshStandardMaterial({
      color: 0x9d7c5a,
      map: mahogany,
      bumpMap: mahogany,
      bumpScale: 0.009,
      roughness: 0.42,
    }),
    deck: new THREE.MeshStandardMaterial({
      color: 0xd7c3a3,
      map: teak,
      bumpMap: teak,
      bumpScale: 0.014,
      roughness: 0.86,
    }),
    floor: new THREE.MeshStandardMaterial({
      color: 0x4e5145,
      map: tread,
      bumpMap: tread,
      bumpScale: 0.018,
      metalness: 0.3,
      roughness: 0.92,
    }),
    brass: paint(0xd4af69, 0.82, 0.28),
    ivory: paint(0xdedbc9, 0.08, 0.61),
    roof: paint(0xbcc6bf, 0.25, 0.6),
    steel: paint(0x344a4c, 0.6, 0.43),
    black: paint(0x101c25, 0.25, 0.54),
    red: paint(0x773d34, 0.2, 0.69),
    rope: paint(0x424841, 0.12, 0.9),
    glass,
    glow,
    ice: new THREE.MeshPhysicalMaterial({
      color: 0xa8c9d7,
      metalness: 0.06,
      roughness: 0.39,
      clearcoat: 0.2,
      clearcoatRoughness: 0.35,
    }),
  };
  for (const material of Object.values(palette)) radialFog(material);
  return palette;
}
// Three's stock depth fog changes with camera heading. Use the physical range
// for every view angle and zoom, leaving distant ice opaque and persistent.
export function radialFog(material: THREE.Material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <fog_vertex>',
      `
      #ifdef USE_FOG
        vFogDepth = length(mvPosition.xyz);
      #endif
    `,
    );
  };
  material.customProgramCacheKey = () => 'titanic-radial-fog-v1';
}
export type ShipMaterials = ReturnType<typeof createShipMaterials>;

export function gaugeFace(title: string, max: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#e4dfc9';
  c.fillRect(0, 0, 256, 256);
  c.fillStyle = '#253637';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = 'bold 21px Georgia';
  c.fillText(title, 128, 180);
  c.font = '20px Georgia';
  c.lineWidth = 2;
  c.strokeStyle = '#39413a';
  for (let n = 0; n <= 30; n++) {
    const angle = ((n / 30) * 1.5 - 0.75) * Math.PI;
    const inner = n % 5 === 0 ? 87 : 93;
    c.beginPath();
    c.moveTo(128 + Math.sin(angle) * inner, 128 - Math.cos(angle) * inner);
    c.lineTo(128 + Math.sin(angle) * 102, 128 - Math.cos(angle) * 102);
    c.stroke();
  }
  if (max === 300) {
    for (const [from, to, color] of [
      [190, 215, '#55735b'],
      [225, 300, '#a24c36'],
    ] as const) {
      c.strokeStyle = color;
      c.lineWidth = 7;
      c.beginPath();
      c.arc(
        128,
        128,
        110,
        ((from / max) * 1.5 - 1.25) * Math.PI,
        ((to / max) * 1.5 - 1.25) * Math.PI,
      );
      c.stroke();
    }
  }
  for (const fraction of [0, 0.5, 1]) {
    const angle = (fraction * 1.5 - 0.75) * Math.PI;
    c.fillText(String(max * fraction), 128 + Math.sin(angle) * 73, 128 - Math.cos(angle) * 73);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.7 });
}

export function softParticleTexture(color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const context = c.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.25, color + 'ad');
  gradient.addColorStop(1, color + '00');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
