// Pure, deterministic satellite-island dressing. Positions are island-local in X/Z
// and world-height in Y. Production and the editor both consume these records.
// Dynamic interactions, aquarium residents, and the giant Frosthook seabed tint
// are intentionally outside this static scene description.
export function islandLandscapeSpec(location, { oceanSurfaceY = -.76 } = {}) {
  const entries = [];
  const groundY = location.elevation + .18;
  const add = (name, primitive, position, size, materialKey, rotation = {}, options = {}) => {
    entries.push({ name, primitive, position, size, materialKey, rotation,
      collision: options.collision === true, climbable: options.climbable === true,
      castShadows: options.castShadows !== false, category: options.category || 'Landscape' });
  };
  if (location.id === 'home-island') {
    const angle = location.angle * Math.PI / 180;
    const pond = {
      x: Math.sin(angle) * 7.8 + Math.cos(angle) * 8.25,
      z: -Math.cos(angle) * 7.8 + Math.sin(angle) * 8.25
    };
    for (let index = 0; index < 9; index += 1) {
      const theta = (index * 41 + 14) * Math.PI / 180;
      let x = Math.cos(theta) * (10 + index % 3 * 2.2);
      let z = Math.sin(theta) * (7 + index % 2 * 2.4);
      const distance = Math.hypot(x - pond.x, z - pond.z);
      if (distance < 6.2) {
        const scale = 6.2 / Math.max(.01, distance);
        x = pond.x + (x - pond.x) * scale;
        z = pond.z + (z - pond.z) * scale;
      }
      const size = .55 + index % 3 * .1;
      const name = `${location.displayName} cozy tree ${index + 1}`;
      add(`${name} climbable trunk`, 'cylinder', { x, y: groundY + 1.3 * size, z },
        { x: .58 * size, y: 2.6 * size, z: .58 * size }, 'wood', {},
        { collision: true, climbable: true, category: 'Hearthward Landscaping' });
      add(`${name} crown`, index % 2 ? 'sphere' : 'cone',
        { x, y: groundY + 3.45 * size, z },
        { x: 2.1 * size, y: (index % 2 ? 1.7 : 3.4) * size, z: 2.1 * size },
        index % 2 ? 'shrubLight' : 'foliage', {}, { category: 'Hearthward Landscaping' });
    }
  } else if (location.id === 'shop-island') {
    for (let index = 0; index < 6; index += 1) add(`Shop cargo crate ${index + 1}`, 'box',
      { x: -8 + index % 3 * 2.1, y: groundY + .48, z: -4 + Math.floor(index / 3) * 2 },
      { x: 1.45, y: .95, z: 1.45 }, 'wood', { y: index * 11 },
      { collision: true, category: "Outfitter's Reach Landscaping" });
  } else if (location.id === 'aquarium-island') {
    for (let index = 0; index < 18; index += 1) {
      const theta = index * Math.PI * 2 / 18;
      add(`Aquarium garden flower ${index + 1}`, 'sphere',
        { x: Math.cos(theta) * 16, y: groundY + .24, z: Math.sin(theta) * 11 },
        { x: .22, y: .32, z: .22 }, index % 2 ? 'flowerPink' : 'flowers', {},
        { castShadows: false, category: 'Glasswater Landscaping' });
    }
  } else if (location.id === 'cave-fishing-island') {
    for (let index = 0; index < 11; index += 1) {
      const angle = (index * 31 + 40) % 360;
      const difference = Math.abs(((angle - location.angle + 540) % 360) - 180);
      if (difference < 27) continue;
      const theta = (index * 31 + 40) * Math.PI / 180;
      add(`Cave island natural rock ${index + 1}`, 'mountain-boulder',
        { x: Math.cos(theta) * (8 + index % 4 * 2), y: groundY + .55,
          z: Math.sin(theta) * (6 + index % 3 * 1.7) },
        { x: 1.5 + index % 3 * .5, y: 1.1 + index % 4 * .55, z: 1.6 },
        'islandRock', {}, { collision: true, castShadows: false, category: 'Basalt Landscaping' });
    }
  } else if (location.id === 'normal-fishing-island') {
    for (let index = 0; index < 20; index += 1) {
      const theta = (index * 18 + 14) * Math.PI / 180;
      const x = Math.cos(theta) * (11.1 + index % 3 * 1.15);
      const z = Math.sin(theta) * (8.1 + index % 2 * 1.05);
      const size = .68 + index % 3 * .08;
      const name = `Mangrove Cay mangrove ${index + 1}`;
      add(`${name} climbable trunk`, 'cylinder', { x, y: groundY + 1.3 * size, z },
        { x: .58 * size, y: 2.6 * size, z: .58 * size }, 'wood', {},
        { collision: true, climbable: true, category: 'Mangrove Landscaping' });
      add(`${name} crown`, 'sphere', { x, y: groundY + 3.45 * size, z },
        { x: 2.1 * size, y: 1.7 * size, z: 2.1 * size }, 'shrubLight', {},
        { category: 'Mangrove Landscaping' });
      for (const side of [-1, 1]) add(`Mangrove Cay root ${index + 1}-${side}`, 'cylinder',
        { x: x + Math.cos(theta + side * .75) * .6, y: groundY + .34,
          z: z + Math.sin(theta + side * .75) * .6 },
        { x: .11, y: 1.25, z: .11 }, 'wood',
        { x: side * 20, y: index * 36, z: side * 48 }, { category: 'Mangrove Landscaping' });
    }
    for (let index = 0; index < 34; index += 1) {
      const theta = index * Math.PI * 2 / 34;
      add(`Mangrove Lagoon reed ${index + 1}`, 'cone',
        { x: Math.cos(theta) * 8.8, y: groundY + .33, z: Math.sin(theta) * 6.65 },
        { x: .12, y: .95 + index % 4 * .16, z: .12 }, index % 3 ? 'shrubLight' : 'dryGrass',
        { z: index % 2 ? 5 : -5 }, { castShadows: false, category: 'Mangrove Landscaping' });
    }
    for (let index = 0; index < 48; index += 1) {
      const theta = (index * 137.5 + 9) * Math.PI / 180;
      const distance = Math.max(9.25, 4.8 + index % 7 * 1.25);
      const x = Math.cos(theta) * distance;
      const z = Math.sin(theta) * distance * .76;
      for (const side of [-1, 1]) add(`Mangrove Cay tropical fern ${index + 1}-${side}`,
        'cone', { x: x + side * .22, y: groundY + .28, z },
        { x: .36, y: .58 + index % 3 * .09, z: .11 },
        index % 3 ? 'shrubLight' : 'shrubDark', { y: index * 31, z: side * 62 },
        { castShadows: false, category: 'Mangrove Landscaping' });
    }
    for (let index = 0; index < 6; index += 1) {
      const theta = (index * 61 + 27) * Math.PI / 180;
      add(`Mangrove Cay fallen jungle log ${index + 1}`, 'cylinder',
        { x: Math.cos(theta) * (7 + index % 3 * 2.1), y: groundY + .22,
          z: Math.sin(theta) * (5.5 + index % 2 * 2) },
        { x: .34, y: 3.1 + index % 2, z: .34 }, 'wood',
        { x: 90, y: index * 37, z: 8 - index * 2 }, { category: 'Mangrove Landscaping' });
    }
    for (let index = 0; index < 18; index += 1) {
      const theta = (index * 47 + 5) * Math.PI / 180;
      add(`Mangrove Cay lush ground-cover mound ${index + 1}`, 'sphere',
        { x: Math.cos(theta) * (9.2 + index % 5 * 1.05), y: groundY,
          z: Math.sin(theta) * (6.8 + index % 4 * .72) },
        { x: .85 + index % 3 * .18, y: .28, z: .7 },
        index % 2 ? 'shrubDark' : 'shrubLight', {},
        { castShadows: false, category: 'Mangrove Landscaping' });
    }
  } else if (location.id === 'cold-island') {
    for (let index = 0; index < 12; index += 1) {
      const theta = (index * 29 + 8) * Math.PI / 180;
      add(`Frosthook ice formation ${index + 1}`, 'cone',
        { x: Math.cos(theta) * (8 + index % 4 * 2), y: groundY + 1.15 + index % 3 * .35,
          z: Math.sin(theta) * (7 + index % 3 * 2) },
        { x: .65 + index % 3 * .22, y: 2.3 + index % 4 * .7, z: .65 },
        'solidIce', { z: index % 2 ? 8 : -9 }, { collision: false, category: 'Frosthook Landscaping' });
    }
    for (let index = 0; index < 18; index += 1) {
      const theta = (index * 41 + 12) * Math.PI / 180;
      const radius = 25 + index % 5 * 3.5;
      add(`Frosthook shoreline ice floe ${index + 1}`, 'sphere',
        { x: Math.cos(theta) * radius, y: oceanSurfaceY + .08,
          z: Math.sin(theta) * radius * .88 },
        { x: 1.2 + index % 4 * .45, y: .11 + index % 2 * .04, z: .8 + index % 3 * .35 },
        index % 3 ? 'solidIce' : 'snow', { y: index * 29, z: index % 2 ? 3 : -3 },
        { castShadows: false, category: 'Frosthook Landscaping' });
    }
    for (let index = 0; index < 36; index += 1) {
      const theta = (index * 137.5 + 6) * Math.PI / 180;
      const radius = 38 + index % 9 * 13.5;
      add(`Frosthook offshore slush plate ${index + 1}`, 'sphere',
        { x: Math.cos(theta) * radius, y: oceanSurfaceY + .035,
          z: Math.sin(theta) * radius * .86 },
        { x: 1.8 + index % 5 * .72, y: .035 + index % 2 * .012,
          z: .75 + index % 4 * .42 },
        index % 5 === 0 ? 'snow' : 'solidIce',
        { y: index * 47, z: index % 2 ? 1.5 : -1.5 },
        { castShadows: false, category: 'Frosthook Landscaping' });
    }
  }
  return entries;
}
