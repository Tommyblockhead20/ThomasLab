const clone = (value) => value == null ? value : structuredClone(value);

export function stockLibraryShelfPrefab(prefab, { density = .9 } = {}) {
  const result = clone(prefab || { parts: [] });
  result.parts ??= [];
  const nonBooks = result.parts.filter((part) => !/(^|[-_ ])book/i.test(`${part.id || ''} ${part.name || ''}`));
  const shelves = nonBooks
    .filter((part) => /shelf/i.test(`${part.id || ''} ${part.name || ''}`) && Number(part.size?.[0]) > 1)
    .sort((left, right) => Number(left.position?.[1]) - Number(right.position?.[1]));
  if (shelves.length < 2) return result;
  const books = [];
  for (let shelfIndex = 0; shelfIndex < shelves.length - 1; shelfIndex += 1) {
    const shelf = shelves[shelfIndex];
    const next = shelves[shelfIndex + 1];
    const usable = Math.max(.5, Number(shelf.size?.[0] || 3) - .34);
    const target = usable * Math.max(.7, Math.min(.96, density * (.94 + (shelfIndex % 3) * .025)));
    let cursor = -usable / 2;
    let occupied = 0;
    let index = 0;
    while (occupied < target && index < 64) {
      const width = .12 + ((index * 7 + shelfIndex * 3) % 5) * .025;
      const gap = index && (index + shelfIndex) % 10 === 7 ? .075 : .018 + (index % 3) * .008;
      if (occupied + gap + width > target + .03) break;
      cursor += gap + width / 2;
      const maximumHeight = Math.max(.32, Number(next.position?.[1]) - Number(shelf.position?.[1]) - .18);
      const height = Math.min(maximumHeight, .48 + ((index * 5 + shelfIndex * 2) % 6) * .045);
      books.push({
        id: `stocked-book-${shelfIndex + 1}-${String(index + 1).padStart(2, '0')}`,
        name: `stocked archive book ${shelfIndex + 1}-${index + 1}`,
        type: 'box', position: [cursor, Number(shelf.position?.[1]) + Number(shelf.size?.[1] || .1) / 2 + height / 2, -.19],
        size: [width, height, .25], rotation: [0, 0, index % 13 === 9 ? (shelfIndex % 2 ? -7 : 7) : 0],
        material: ['bookGreen', 'bookRed', 'bookBlue'][(index + shelfIndex) % 3], solid: false,
        metadata: { generatedStocking: true, shelfIndex, bookCluster: Math.floor(index / 5) }
      });
      cursor += width / 2;
      occupied += gap + width;
      index += 1;
    }
  }
  result.parts = [...nonBooks, ...books];
  result.metadata = { ...(result.metadata ?? {}), bookDensity: density, bookDensityLabel: density >= .92 ? 'Packed' : 'Full', generatedBookCount: books.length };
  return result;
}

export function stockLibraryScene(scene, options = {}) {
  const result = clone(scene);
  if (result?.prefabs?.['shelf-bay']) result.prefabs['shelf-bay'] = stockLibraryShelfPrefab(result.prefabs['shelf-bay'], options);
  return result;
}
