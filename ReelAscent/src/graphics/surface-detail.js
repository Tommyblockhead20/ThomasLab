import * as pc from 'playcanvas';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const textureCache = new WeakMap();
const TAU = Math.PI * 2;
const noise = (x, y) => {
  const value = Math.sin(x * 127.1 + y * 311.7 + 17.7) * 43758.5453;
  return value - Math.floor(value);
};

// Small, deterministic, seamless material tiles. Shared by all matching surfaces on
// one graphics device, including previews; nothing is downloaded or updated per frame.
export function createSurfacePixels(kind, size = 128) {
  const heights = new Float32Array(size * size);
  const color = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, grain = noise(x, y) - .5;
    const broad = Math.sin(TAU * (u * 3 + Math.sin(v * TAU) * .24)) * Math.cos(v * TAU * 2);
    let h = .5, shade = 1;
    if (kind === 'wood') {
      const lines = Math.sin(TAU * (u * 22 + Math.sin(v * TAU * 2) * .1 + Math.sin(u * TAU * 2 + v * TAU) * .06));
      const fine = Math.sin(TAU * (u * 51 + Math.sin(v * TAU) * .18));
      h = .5 + lines * .07 + fine * .015 + grain * .025;
      shade = .97 + lines * .02 + fine * .008 + grain * .025;
    } else if (kind === 'fabric') {
      const warp = Math.cos(x * Math.PI / 2), weft = Math.cos(y * Math.PI / 2);
      h = .5 + (warp + weft) * .12;
      shade = .95 + (warp + weft) * .018 + grain * .025;
    } else if (kind === 'roof') {
      const seam = Math.min(x % 32, 32 - x % 32) < 2;
      h = seam ? .22 : .62 + grain * .08;
      shade = seam ? .73 : .95 + broad * .025 + grain * .025;
    } else if (kind === 'sand') {
      h = .5 + grain * .34 + broad * .04;
      shade = .95 + grain * .09 + broad * .025;
    } else if (kind === 'grass') {
      const blades = Math.sin(TAU * (u * 21 + Math.sin(v * TAU * 3))) * Math.cos(v * TAU * 15);
      h = .5 + blades * .12 + grain * .13;
      shade = .94 + broad * .045 + blades * .025 + grain * .055;
    } else if (kind === 'scales') {
      const row = Math.floor(v * 18), du = ((u * 28 + (row % 2) * .5) % 1) - .5;
      const dv = (v * 18) % 1;
      const edge = Math.abs(Math.sqrt(du * du + (dv - .15) ** 2) - .52);
      h = .5 + (edge < .055 ? -.12 : .06) + grain * .025;
      shade = edge < .055 ? .94 : .99 + grain * .015;
    } else if (kind === 'rock-rough') {
      const fracture = Math.abs(Math.sin(TAU * (u * 5 + v * 3 + broad * .16)));
      const chips = noise(Math.floor(x / 7), Math.floor(y / 7)) - .5;
      h = .5 + chips * .25 + grain * .24 - (fracture < .11 ? .2 : 0);
      shade = .9 + chips * .105 + grain * .06 - (fracture < .11 ? .09 : 0);
    } else if (kind === 'rock-normal') {
      const strata = Math.sin(TAU * (v * 8 + u * .7 + broad * .12));
      h = .5 + strata * .075 + grain * .14;
      shade = .94 + strata * .07 + grain * .04;
    } else if (kind === 'rock-smooth') {
      const polish = Math.sin(TAU * (u * 2 + v * .8));
      h = .5 + polish * .025 + grain * .035;
      shade = .98 + polish * .018 + grain * .012;
    } else if (kind === 'rock-ice') {
      const shard = Math.abs(Math.sin(TAU * (u * 3 - v * 5 + broad * .09)));
      h = .5 + (shard < .055 ? -.1 : .025) + grain * .035;
      shade = .96 + (shard < .055 ? -.09 : .015) + grain * .015;
    } else if (kind === 'core-standable') {
      const bladeRow = Math.floor(y / 9), bladeColumn = Math.floor((x + (bladeRow % 2) * 4) / 7);
      const stem = noise(bladeColumn, bladeRow) > .26
        && Math.abs((x + (bladeRow % 2) * 4) % 7 - 3 - (y % 9 - 4) * .22) < .85;
      const tuft = noise(Math.floor(x / 12), Math.floor(y / 12)) - .5;
      h = .5 + tuft * .09 + grain * .055 + (stem ? .12 : 0);
      shade = .91 + tuft * .07 + grain * .03 + (stem ? .065 : 0);
    } else if (kind === 'core-walkable') {
      const contour = Math.sin(TAU * (v * 6 + u * 1.5 + broad * .12));
      const blades=Math.sin(TAU*(u*18+Math.sin(v*TAU*3)))*Math.cos(v*TAU*13);
      h = .5 + contour * .045 + blades*.07 + grain * .085;
      shade = .94 + contour * .035 + blades*.03 + grain * .035;
    } else if (kind === 'core-slide') {
      const streak = Math.sin(TAU * (u * 12 + v * .5 + broad * .08));
      h = .5 + streak * .045 + grain * .06;
      shade = .93 + streak * .045 + grain * .025;
    } else {
      const vein = Math.abs(Math.sin(TAU * (u * 3 + v * 2 + broad * .22)));
      h = .5 + broad * .12 + grain * .2 - (vein < .055 ? .09 : 0);
      shade = .94 + broad * .045 + grain * .065 - (vein < .055 ? .035 : 0);
    }
    const i = y * size + x; heights[i] = h;
    const value = Math.round(clamp(shade, .7, 1) * 255);
    color.set([value, value, value, 255], i * 4);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (xx, yy) => heights[((yy + size) % size) * size + ((xx + size) % size)];
    const dx = (at(x - 1, y) - at(x + 1, y)) * .6;
    const dy = (at(x, y - 1) - at(x, y + 1)) * .6;
    const length = Math.hypot(dx, dy, 1);
    normal.set([Math.round((dx / length * .5 + .5) * 255), Math.round((dy / length * .5 + .5) * 255), Math.round((1 / length * .5 + .5) * 255), 255], (y * size + x) * 4);
  }
  return { color, normal, size };
}

export function applySurfaceDetail(material, device, kind, { tiling = 1, strength = .3 } = {}) {
  if (!device) return material; // CPU-only model and geometry tests have no GPU.
  let cache = textureCache.get(device);
  if (!cache) { cache = new Map(); textureCache.set(device, cache); }
  let pair = cache.get(kind);
  if (!pair) {
    const pixels = createSurfacePixels(kind);
    const texture = (name, bytes, srgb) => new pc.Texture(device, {
      name, width: pixels.size, height: pixels.size, format: pc.PIXELFORMAT_RGBA8,
      mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_REPEAT, anisotropy: 4,
      srgb, levels: [bytes]
    });
    pair = { color: texture(`${kind} albedo`, pixels.color, true), normal: texture(`${kind} relief`, pixels.normal, false) };
    cache.set(kind, pair);
    device.once?.('destroy', () => { pair.color.destroy(); pair.normal.destroy(); });
  }
  material.diffuseMap = pair.color;
  material.normalMap = pair.normal;
  material.diffuseMapTiling.set(tiling, tiling);
  material.normalMapTiling.set(tiling, tiling);
  material.bumpiness = strength;
  material._surfaceDetail = kind;
  material.update();
  return material;
}

// Give procedural meshes real UVs. Selecting the dominant normal avoids stretching
// vertical faces into one texel; positions, normals and collider data are untouched.
export function addSurfaceUvs(geometry, scale = .36) {
  if (geometry.uvs?.length) return geometry;
  const result = [];
  for (let i = 0; i < geometry.positions.length; i += 3) {
    const [x, y, z] = geometry.positions.slice(i, i + 3);
    const nx = Math.abs(geometry.normals?.[i] ?? 0), ny = Math.abs(geometry.normals?.[i + 1] ?? 1), nz = Math.abs(geometry.normals?.[i + 2] ?? 0);
    result.push((ny >= nx && ny >= nz ? x : nx > nz ? z : x) * scale, (ny >= nx && ny >= nz ? z : y) * scale);
  }
  geometry.uvs = result;
  return geometry;
}
