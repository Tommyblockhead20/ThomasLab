import { modelMesh } from '../fishing/fish-sculpture.js';
import { sweptTube, sculptedPanel, revolvedSurface } from '../graphics/sculpted-geometry.js';
import { buildSpeciesReward } from './species-cosmetics.js';

// Silhouettes are shared by the wardrobe and both multiplayer/local characters.
export function buildCosmeticSculpture(root, cosmetic, materials, { blob, headY, add }) {
  if (!root._app?.graphicsDevice) return false;
  if (buildSpeciesReward(root,cosmetic,materials,{blob,headY,add})) return true;
  const size = blob ? 1.16 : 1;
  const mesh = (label, data, material = materials.accessory) => {
    data.positions = data.positions.map((v, i) => i % 3 === 1 ? v : v * size);
    return modelMesh(root, `${cosmetic.label} ${label}`, data, material);
  };
  const tube = (label, points, material = materials.accessory, sides = 10) => mesh(label, sweptTube(points, sides), material);
  const panel = (label, points, material = materials.accessory, thickness = .025) => mesh(label, sculptedPanel(points, thickness), material);
  const ring = (label, rx, rz, y, z = 0, radius = .025, material = materials.accessory) => tube(label, Array.from({ length: 49 }, (_, i) => { const a = i / 48 * Math.PI * 2; return [Math.cos(a) * rx, y, z + Math.sin(a) * rz, radius]; }), material);
  const visual = cosmetic.visual;
  if(visual==='gold-top-hat'||visual==='pearl-pendant') {
    const precious=materials.accessoryMetal.clone();precious.name=cosmetic.label;
    if(visual==='gold-top-hat'){precious.diffuse.set(.94,.67,.17);precious.metalness=.88;precious.gloss=.86;}
    else {precious.diffuse.set(.84,.9,.88);precious.metalness=.25;precious.gloss=.93;precious.emissive.set(.035,.045,.05);}
    precious.update();root.once('destroy',()=>precious.destroy());
    if(visual==='gold-top-hat') {
      mesh('broad gold brim',revolvedSurface([[headY-.04,.31],[headY,.36],[headY+.04,.31]],32),precious);
      mesh('tapered golden crown',revolvedSurface([[headY+.01,.235],[headY+.37,.21],[headY+.43,.23],[headY+.43,0]],32),precious);
      ring('dark satin band',.235,.235,headY+.075,0,.025,materials.dark);
      add('pearl hat pin','sphere',{x:.12,y:headY+.1,z:-.22},{x:.065,y:.065,z:.04},materials.silver);
    }else {
      const y=blob?.44:.45,z=blob?-.5:-.28;
      ring('platinum neck chain',blob?.34:.245,blob?.34:.245,y,0,.014,materials.silver);
      ring('pearl setting',.11,.035,y-.18,z,.014,precious);
      add('large moon pearl','sphere',{x:0,y:y-.2,z:z-.015},{x:.19,y:.23,z:.13},precious);
      for(const side of [-1,1])tube('pendant cradle',[[side*.1,y-.12,z,.014],[side*.095,y-.26,z,.012],[0,y-.31,z,.008]],materials.silver,7);
    }
    return true;
  }
  if (cosmetic.slot === 'eyewear' && ['glasses', 'round', 'aviator', 'goggles', 'visor', 'hammer', 'electric', 'sun'].includes(visual)) {
    const y = blob ? .85 : .73, z = blob ? -.48 : -.267;
    const round = ['round', 'goggles', 'aviator', 'sun', 'electric'].includes(visual);
    if (visual === 'visor') {
      panel('curved visor lens', [[-.21, y + .07, z + .035], [-.07, y + .08, z - .015], [.07, y + .08, z - .015], [.21, y + .07, z + .035], [.18, y - .06, z + .025], [-.18, y - .06, z + .025]], materials.glass, .015);
      tube('visor brow', [[-.22, y + .08, z + .03, .015], [0, y + .09, z - .02, .015], [.22, y + .08, z + .03, .015]], materials.accessoryMetal);
    } else for (const side of [-1, 1]) {
      const x = side * .13;
      const outline = round ? Array.from({ length: 33 }, (_, i) => { const a = i / 32 * Math.PI * 2; return [x + Math.cos(a) * .098, y + Math.sin(a) * (visual === 'aviator' ? .083 : .076) - (visual === 'aviator' ? Math.max(0, -Math.sin(a)) * .025 : 0), z, visual === 'goggles' ? .018 : .012]; })
        : [[x - .095, y - .065, z, .012], [x - .095, y + .065, z, .012], [x + .095, y + .065, z, .012], [x + .095, y - .065, z, .012], [x - .095, y - .065, z, .012]];
      tube('shaped lens rim', outline, materials.accessoryMetal, 8);
      add('fitted lens', round ? 'sphere' : 'box', { x, y: y - (visual === 'aviator' ? .012 : 0), z: z + .009 }, { x: .174, y: visual === 'aviator' ? .16 : .13, z: .018 }, visual === 'round' || visual === 'aviator' ? materials.dark : materials.glass);
    }
    tube('nose bridge', [[-.035, y + .025, z, .01], [0, y + .045, z - .007, .01], [.035, y + .025, z, .01]], materials.accessoryMetal, 8);
    for (const side of [-1, 1]) tube('temple arm', [[side * .22, y + .035, z + .01, .012], [side * .25, y + .035, .05, .012], [side * .23, y, .15, .008]], materials.accessoryMetal, 8);
    if (visual === 'goggles') ring('goggle strap', .25, .245, y + .015, 0, .018, materials.dark);
    for (const side of [-1,1]) {
      if(visual==='hammer') {tube('hammerhead temple',[[side*.18,y+.045,z,.022],[side*.33,y+.025,z+.025,.03],[side*.37,y-.045,z+.04,.017]],materials.accessoryMetal);add('hammerhead side eye','sphere',{x:side*.365,y:y+.025,z:z+.015},{x:.06,y:.075,z:.025},materials.glass);}
      if(visual==='electric') tube('lightning temple',[[side*.2,y+.04,z,.012],[side*.29,y+.15,z,.012],[side*.27,y+.075,z,.012],[side*.35,y+.1,z,.003]],materials.silver,7);
      if(visual==='sun')for(let ray=0;ray<7;ray++){const a=(ray/6-.5)*Math.PI; tube('sunburst lens ray',[[side*.13+Math.sin(a)*.09,y+Math.cos(a)*.08,z,.01],[side*.13+Math.sin(a)*.135,y+Math.cos(a)*.125,z,.003]],materials.accessoryMetal,6);}
    }
    return true;
  }
  if (cosmetic.slot === 'headwear' && ['cowboy', 'bucket', 'wizard', 'beanie', 'crown', 'halo', 'hood', 'tentacle', 'gills'].includes(visual)) {
    if (['cowboy', 'bucket', 'wizard', 'beanie'].includes(visual)) {
      if (visual !== 'beanie') {
        const radius = visual === 'cowboy' ? .4 : .34;
        const data = revolvedSurface([[headY - .035, .235], [headY - .035, radius], [headY + .005, radius], [headY + .005, .235]], 40,
          (a, r) => visual === 'cowboy' ? Math.pow(Math.abs(Math.cos(a)), 4) * .095 * (r / radius) : visual === 'bucket' ? -.06 * r / radius : 0);
        mesh('shaped brim', data);
      }
      const profile = visual === 'wizard' ? [[headY, .225], [headY + .2, .19], [headY + .43, .12], [headY + .62, .07], [headY + .72, .002]]
        : visual === 'beanie' ? [[headY - .035, .24], [headY + .12, .25], [headY + .25, .19], [headY + .34, .015]]
          : visual === 'bucket' ? [[headY, .23], [headY + .24, .2], [headY + .27, .16], [headY + .27, .002]]
            : [[headY, .22], [headY + .2, .225], [headY + .29, .18], [headY + .3, .002]];
      const data = revolvedSurface(profile, 32, (a, r, row) => visual === 'cowboy' && row > 1 ? -.05 * Math.pow(Math.sin(a), 2) : 0);
      if (visual === 'wizard') data.positions = data.positions.map((v, i) => i % 3 === 0 ? v + Math.max(0, data.positions[i + 1] - headY - .3) ** 2 * 1.4 : v);
      mesh('tailored crown', data);
      ring('fitted band', .232, .232, headY + .065, 0, visual === 'beanie' ? .04 : .022, materials.dark);
      if (visual === 'beanie') add('knit pom', 'sphere', { x: 0, y: headY + .35, z: 0 }, { x: .115, y: .11, z: .115 });
      if (visual === 'wizard') for (const side of [-1, 1]) panel('embroidered star', [[side * .08, headY + .21, -.18], [side * .08 - .035, headY + .25, -.18], [side * .08, headY + .3, -.18], [side * .08 + .035, headY + .25, -.18]], materials.silver);
    } else if (visual === 'crown') {
      ring('royal lower circlet', .265, .265, headY, 0, .035);
      ring('royal upper circlet', .265, .265, headY + .085, 0, .027, materials.silver);
      for (let i = 0; i < 8; i += 1) { const a = i / 8 * Math.PI * 2; tube(`swept crown point ${i}`, [[Math.cos(a) * .265, headY + .06, Math.sin(a) * .265, .045], [Math.cos(a) * .29, headY + .24 + (i % 2) * .06, Math.sin(a) * .29, .005]], materials.accessory, 8); add('inset jewel', 'sphere', { x: Math.cos(a) * .28, y: headY + .085, z: Math.sin(a) * .28 }, { x: .065, y: .075, z: .065 }, materials.silver); }
    } else if (visual === 'halo') {
      ring('continuous halo', .38, .38, headY + .38, 0, .027, materials.accessoryMetal);
      for (let i = 0; i < 5; i += 1) { const a = i * Math.PI * 2 / 5; add('halo jewel', 'sphere', { x: Math.cos(a) * .38, y: headY + .38, z: Math.sin(a) * .38 }, { x: .065, y: .065, z: .065 }, materials.silver); }
    } else if (visual === 'hood') {
      const hood = revolvedSurface([[headY - .26, .29], [headY + .03, .3], [headY + .24, .22], [headY + .31, .002]], 28);
      const openIndices = []; for (let i = 0; i < hood.indices.length; i += 3) { const tri = hood.indices.slice(i, i + 3); if (tri.reduce((sum, v) => sum + hood.positions[v * 3 + 2], 0) / 3 < -.09 && tri.reduce((sum, v) => sum + hood.positions[v * 3 + 1], 0) / 3 < headY + .06) continue; openIndices.push(...tri); } hood.indices = openIndices;
      mesh('open face hood', hood);
      // Back drape stays behind the face and joins the shoulders.
      panel('hood shoulder drape', [[-.27, headY, .12], [-.35, headY - .48, .24], [.35, headY - .48, .24], [.27, headY, .12]]);
      if(cosmetic.id==='catch-giant_panda')for(const side of [-1,1]){add('rounded panda ear','sphere',{x:side*.23,y:headY+.23,z:.01},{x:.18,y:.19,z:.13},materials.dark);add('panda ear inset','sphere',{x:side*.23,y:headY+.23,z:-.055},{x:.1,y:.11,z:.018},materials.silver);}
    } else if (visual === 'tentacle') {
      add('soft octopus mantle', 'sphere', { x: 0, y: headY + .2, z: 0 }, { x: .48, y: .4, z: .45 });
      for (let i = 0; i < 8; i += 1) { const a = i / 8 * Math.PI * 2; tube(`curling hat arm ${i}`, Array.from({ length: 15 }, (_, j) => { const t = j / 14, r = .16 + t * .26, phase = a + t * t * .4; return [Math.cos(phase) * r, headY + .1 - Math.sin(t * 2) * .19 + t * t * .1, Math.sin(phase) * r, .055 * (1 - t) + .008]; })); }
      for (const x of [-.12, .12]) add('octopus eye', 'sphere', { x, y: headY + .24, z: -.208 }, { x: .055, y: .065, z: .025 }, materials.dark);
    } else if (visual === 'gills') {
      ring('axolotl fitted band', .25, .25, headY, 0, .025);
      for (const side of [-1, 1]) for (let i = 0; i < 3; i += 1) {
        const tip = [side * (.43 + i * .04), headY + .15 - i * .12, .015];
        tube(`gill stem ${side}:${i}`, [[side * .22, headY + .02, 0, .035], [...tip, .009]]);
        for (let f = 0; f < 4; f += 1) tube('fine gill filament', [[side * (.28 + f * .035), headY + (.1 - i * .1) * (f + 1) / 4, 0, .012], [side * (.32 + f * .04), headY + .1 - i * .12 + .055, .015, .002]], materials.silver, 6);
      }
    }
    return true;
  }
  if (cosmetic.slot === 'faceAccessory' && ['serpent', 'scarf', 'whirlpool', 'necklace'].includes(visual)) {
    const y = blob ? .44 : .45, r = blob ? .34 : .245, z = blob ? -.49 : -.27;
    if (visual === 'serpent') {
      tube('continuous coiled serpent', Array.from({ length: 50 }, (_, i) => { const t = i / 49, a = t * Math.PI * 2.35; return [Math.cos(a) * r, y + .015 + t * .035, Math.sin(a) * r, .045]; }));
      tube('raised serpent neck', [[.19, y, -.09, .045], [.3, y + .13, -.16, .033], [.27, y + .24, -.22, .025]]);
      add('serpent head', 'sphere', { x: .27, y: y + .25, z: -.25 }, { x: .13, y: .095, z: .12 });
      for (const side of [-1, 1]) add('serpent eye', 'sphere', { x: .27 + side * .055, y: y + .27, z: -.28 }, { x: .02, y: .025, z: .02 }, materials.silver);
    } else if (visual === 'scarf') {
      ring('soft scarf wrap', r, r, y, 0, .065);
      panel('draping scarf end', [[.12, y + .03, -.2], [.24, y - .07, -.25], [.27, y - .55, -.31], [.08, y - .53, -.29]], materials.accessory, .05);
      for (let i = 0; i < 5; i += 1) tube('fringe', [[.1 + i * .035, y - .52, -.3, .009], [.1 + i * .035, y - .61, -.32, .003]], materials.accessory, 6);
    } else if (visual === 'whirlpool') {
      tube('whirlpool pendant', Array.from({ length: 55 }, (_, i) => { const t = i / 54, a = t * Math.PI * 5, r = .015 + .16 * t; return [Math.cos(a) * r, y - .18 + Math.sin(a) * r, z - .03, .013]; }), materials.accessoryMetal);
      ring('pendant cord', r, r, y, 0, .013, materials.dark);
    } else {
      ring('necklace chain', r, r, y, 0, .014, materials.silver);
      tube('pendant drop', [[0, y, -r, .012], [0, y - .19, z, .012]], materials.silver);
      add('faceted pendant', 'sphere', { x: 0, y: y - .21, z }, { x: .12, y: .16, z: .045 }, materials.accessoryMetal, { z: 45 });
    }
    return true;
  }
  if (cosmetic.slot === 'backAccessory' && ['wings', 'fin', 'claws', 'tentacle', 'shell', 'hydra', 'cape'].includes(visual)) {
    const y = blob ? .05 : -.03, z = blob ? .55 : .39;
    if(visual==='hydra') {
      add('hydra harness','box',{x:0,y,z},{x:.32,y:.55,z:.13},materials.pack);
      for(let i=-1;i<=1;i++) {
        const hx=i*.4,hy=y+.48+(.12*(1-Math.abs(i)));
        tube(`hydra curved neck ${i}`,[[i*.09,y-.2,z,.08],[i*.22,y+.08,z+.08,.075],[hx,hy,z+.09,.055]]);
        add('hydra armored head','sphere',{x:hx,y:hy+.04,z:z+.1},{x:.23,y:.17,z:.22});
        add('hydra open jaw','sphere',{x:hx,y:hy-.035,z:z+.17},{x:.18,y:.06,z:.18},materials.dark);
        for(const side of [-1,1]) {tube('hydra swept horn',[[hx+side*.07,hy+.09,z+.06,.025],[hx+side*.13,hy+.24,z+.03,.002]],materials.silver,7);add('hydra eye','sphere',{x:hx+side*.09,y:hy+.065,z:z+.17},{x:.032,y:.035,z:.025},materials.silver);}
      }
    } else if(visual==='cape') {
      const points=[[-.2,y+.31,z],[.2,y+.31,z],[.38,y-.32,z+.12],[.24,y-.52,z+.17],[.12,y-.46,z+.15],[0,y-.58,z+.18],[-.12,y-.46,z+.15],[-.24,y-.52,z+.17],[-.38,y-.32,z+.12]];
      panel('tailored scalloped cape',points);
      tube('cape neckline',[[-.21,y+.31,z,.025],[0,y+.34,z,.025],[.21,y+.31,z,.025]],materials.silver);
      for(const x of [-.22,0,.22])tube('cape embroidered seam',[[x*.6,y+.24,z+.02,.009],[x,y-.37,z+.15,.006]],materials.silver,6);
    } else if (visual === 'wings' || visual === 'fin') {
      add('harness', 'box', { x: 0, y, z }, { x: .35, y: .6, z: .13 }, materials.pack);
      for (const side of [-1, 1]) {
        const p = [[side * .12, y + .3, z], [side * .53, y + .4, z + .05], [side * .98, y + .05, z + .15], [side * .7, y - .1, z + .25], [side * .33, y - .48, z + .2], [side * .12, y - .3, z]];
        panel('swept manta membrane', p, materials.accessory, .04);
        for (const tip of [p[2], p[3], p[4]]) tube('wing rib', [[side * .12, y + .2, z + .01, .022], [...tip, .007]], materials.silver, 7);
      }
    } else if (visual === 'shell') {
      add('domed shell', 'sphere', { x: 0, y, z: z + .08 }, { x: .62, y: .72, z: .3 });
      if(/turtle/.test(cosmetic.id)) {
        tube('turtle shell rim',Array.from({length:49},(_,i)=>{const a=i/48*Math.PI*2;return[Math.cos(a)*.29,y+Math.sin(a)*.34,z+.145,.02];}),materials.silver);
        for(const [cx,cy] of [[0,0],[.16,.1],[-.16,.1],[.14,-.15],[-.14,-.15],[0,.22],[0,-.25]]) tube('hexagonal turtle scute',Array.from({length:7},(_,i)=>{const a=i/6*Math.PI*2;return[cx+Math.cos(a)*.09,y+cy+Math.sin(a)*.1,z+.232-.18*(cx*cx+cy*cy),.012];}),materials.dark,7);
      } else tube('continuous raised shell spiral', Array.from({ length: 65 }, (_, i) => { const t = i / 64, a = t * Math.PI * 5, r = .015 + t * .27; return [Math.cos(a) * r, y + Math.sin(a) * r, z + .235 - t * .03, .021]; }), materials.silver);
    } else for (const side of [-1, 1]) for (let i = 0; i < (visual === 'claws' ? 2 : 3); i += 1) {
      const x = side * (.12 + i * .07);
      tube(`swept mantle arm ${side}:${i}`, [[x, y + .23, z, .065], [side * (.48 + i * .09), y + .05 - i * .14, z + .1, .055], [side * (.59 + i * .08), y - .31 - i * .1, z + .19, .035], [side * (.42 + i * .1), y - .44 - i * .1, z + .25, .006]]);
      if (visual === 'claws') for (const branch of [-1, 1]) tube('split pincer', [[side * (.53 + i * .09), y - .32 - i * .1, z + .2, .035], [side * (.45 + i * .1) + branch * .07, y - .54 - i * .1, z + .25, .004]], materials.silver);
    }
    return true;
  }
  return false;
}
