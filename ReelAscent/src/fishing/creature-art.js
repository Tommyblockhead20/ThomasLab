const rgb = hex => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
const palette = (back, flank, belly, fin, pattern = 'scales') => ({ back: rgb(back), flank: rgb(flank), belly: rgb(belly), fin: rgb(fin), pattern });

// Art direction belongs to presentation: species identities, rarity, size, saves,
// ecology and catch odds are never changed by this palette.
export function creatureArt(species, archetype, shiny = false) {
  const name = String(species?.name ?? species?.id ?? '').toLowerCase();
  let p;
  if (/rainbow.*trout|steelhead/.test(name)) p = palette(0x4a6661,0x9aaab0,0xe4dcd0,0xb87573,'rainbow');
  else if (/brook|char|dolly/.test(name)) p = palette(0x304841,0x647665,0xd2a071,0xb76d47,'light-spots');
  else if (/golden|goldfish|koi/.test(name)) p = palette(0x9c6837,0xd7a54c,0xf0dcc0,0xc57936,'scales');
  else if (/brown.*trout|tiger.*trout/.test(name)) p = palette(0x66533c,0xb69a68,0xead8a9,0x9d7146,'spots');
  else if (/trout|salmon|whitefish|grayling/.test(name)) p = palette(0x45636a,0xa3b6b4,0xe0ded0,0x7c8e89,'spots');
  else if (/bass|perch|walleye|pickerel|pike|muskellunge/.test(name)) p = palette(0x394f3c,0x83946a,0xdbd6b3,0x8f9361,'stripe');
  else if (/bluegill|sunfish|pumpkinseed/.test(name)) p = palette(0x3d6259,0x7d9e79,0xd1b66c,0x6c8274,'bars');
  else if (/carp|sucker|loach/.test(name)) p = palette(0x62513a,0xab9363,0xdac7a2,0x8f734c,'scales');
  else if (/betta/.test(name)) p = palette(0x233e58,0x527f9e,0xa4beb7,0xa14856,'scales');
  else if (/clownfish/.test(name)) p = palette(0xb85829,0xd38b44,0xe6d0a5,0xa6522d,'white-bars');
  else if (/angelfish/.test(name)) p = palette(0x4b5056,0xb7b5a4,0xd9d5bc,0x777b78,'bars');
  else if (/catfish/.test(name)) p = palette(0x3e5056,0x7d9295,0xcecfc0,0x6a7f7e,'skin');
  else if (['shark','dogfish'].includes(archetype)) p = palette(0x364c59,0x71858a,0xd7d5c5,0x516b76,'skin');
  else if (['ray','skate','flatfish'].includes(archetype)) p = palette(0x494939,0x8e8969,0xd8cda8,0x797957,'spots');
  else if (['panfish','bass','slender','sculpin','trout','carp','catfish','eel'].includes(archetype)) p = palette(0x365760,0x91aaa7,0xdcded0,0x6b9297,'scales');
  else if (/panda|penguin|orca/.test(name)) p = palette(0x242c2e,0xe2ded0,0xe8e2d2,0x343f43,'skin');
  else if (/polar.*bear|beluga/.test(name)) p = palette(0xc3c4b5,0xe0dfce,0xeee8d7,0xb6b9ad,'skin');
  else if (['frog','turtle','salamander','serpent'].includes(archetype)) p = palette(0x3b5240,0x778a54,0xb7b77f,0x596b42,'spots');
  else if (['crab','lobster','crayfish','shrimp'].includes(archetype)) p = palette(0x62483b,0x9c7858,0xc8ad84,0x856c52,'shell');
  else if (['cetacean','pinniped'].includes(archetype)) p = palette(0x344c58,0x798b8d,0xc7c9bb,0x536b72,'skin');
  else if (['otter','mammal','beaver','platypus','rodent','waterhorse'].includes(archetype)) p = palette(0x4b3e32,0x796347,0xb8a078,0x514536,'fur');
  else if (['clam','bivalve','mussel','oyster','snail','nautilus'].includes(archetype)) p = palette(0x3b4c53,0x7b8d89,0xc6bb9e,0xa79471,'shell');
  else if (['octopus','squid','lusca','softbody'].includes(archetype)) p = palette(0x714e4e,0xad8170,0xd2b5a0,0x95685f,'spots');
  else p = palette(0x4b6072,0x88a1ac,0xc2cfc3,0x8b91ad,'spots');
  if (shiny) {
    const shift = color => color.map((c,i) => Math.min(1,c * .68 + [.34,.25,.1][i]));
    p = { ...p, back: shift(p.back), flank: shift(p.flank), belly: shift(p.belly), fin: shift(p.fin) };
  }
  return p;
}
