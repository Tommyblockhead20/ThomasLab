const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clone = (value) => value == null ? value : structuredClone(value);

function axisValue(value, axis, fallback = 0) {
  const index = { x: 0, y: 1, z: 2 }[axis];
  return finite(Array.isArray(value) ? value[index] : value?.[axis], fallback);
}

function cleanId(value) {
  return String(value || 'part').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

export function cutRectangularOpeningInBox(recordInput, openingInput = {}) {
  const record = clone(recordInput);
  const rawPosition = record.transform?.position ?? record.position;
  const rotation = record.transform?.rotation ?? record.rotation ?? { x: 0, y: 0, z: 0 };
  const size = record.size ?? record.transform?.scale;
  if (!rawPosition || !size) throw new Error('Cut Opening requires a positioned box record.');
  const position = { x: axisValue(rawPosition, 'x'), y: axisValue(rawPosition, 'y'), z: axisValue(rawPosition, 'z') };
  if (['x', 'y', 'z'].some((axis) => Math.abs(axisValue(rotation, axis)) > 1e-5)) {
    throw new Error('Cut Opening currently requires an axis-aligned box. Apply rotation first or cut the source prefab locally.');
  }
  const dimensions = { x: axisValue(size, 'x', 1), y: axisValue(size, 'y', 1), z: axisValue(size, 'z', 1) };
  const thicknessAxis = openingInput.thicknessAxis
    ?? Object.entries(dimensions).sort((a, b) => a[1] - b[1])[0][0];
  const planeAxes = ['x', 'y', 'z'].filter((axis) => axis !== thicknessAxis);
  const [u, v] = planeAxes;
  const center = openingInput.center ?? position;
  const openingSize = openingInput.size ?? {};
  const half = { u: Math.max(.025, finite(openingSize[u], dimensions[u] * .35)) / 2, v: Math.max(.025, finite(openingSize[v], dimensions[v] * .35)) / 2 };
  const bounds = {
    u0: position[u] - dimensions[u] / 2, u1: position[u] + dimensions[u] / 2,
    v0: position[v] - dimensions[v] / 2, v1: position[v] + dimensions[v] / 2
  };
  const opening = {
    u0: finite(center[u], position[u]) - half.u, u1: finite(center[u], position[u]) + half.u,
    v0: finite(center[v], position[v]) - half.v, v1: finite(center[v], position[v]) + half.v
  };
  if (opening.u0 <= bounds.u0 || opening.u1 >= bounds.u1 || opening.v0 <= bounds.v0 || opening.v1 >= bounds.v1) {
    throw new Error('Opening must remain inside the selected surface with a positive structural border.');
  }
  const rectangles = [
    [bounds.u0, opening.u0, bounds.v0, bounds.v1, 'left'],
    [opening.u1, bounds.u1, bounds.v0, bounds.v1, 'right'],
    [opening.u0, opening.u1, bounds.v0, opening.v0, 'lower'],
    [opening.u0, opening.u1, opening.v1, bounds.v1, 'upper']
  ];
  const sourceId = cleanId(record.id || record.name);
  return rectangles.map(([u0, u1, v0, v1, suffix]) => {
    const part = clone(record);
    part.id = `${sourceId}-opening-${suffix}`;
    part.name = `${record.name || record.id || 'Surface'} — opening ${suffix}`;
    const nextPosition = { x: position.x, y: position.y, z: position.z };
    nextPosition[u] = (u0 + u1) / 2;
    nextPosition[v] = (v0 + v1) / 2;
    const nextSize = { x: dimensions.x, y: dimensions.y, z: dimensions.z };
    nextSize[u] = u1 - u0;
    nextSize[v] = v1 - v0;
    if (record.transform) {
      part.transform.position = nextPosition;
      part.size = nextSize;
    } else {
      part.position = [nextPosition.x, nextPosition.y, nextPosition.z];
      part.size = [nextSize.x, nextSize.y, nextSize.z];
    }
    part.metadata = {
      ...(part.metadata ?? {}), cutOpeningSourceId: String(record.id || ''),
      cutOpening: { thicknessAxis, center: clone(center), size: clone(openingSize), fragment: suffix }
    };
    return part;
  });
}

export function generateStairAssembly(options = {}) {
  const start = { x: finite(options.start?.x), y: finite(options.start?.y), z: finite(options.start?.z) };
  const end = { x: finite(options.end?.x, start.x), y: finite(options.end?.y, start.y + 3), z: finite(options.end?.z, start.z - 5) };
  const count = Math.max(1, Math.trunc(finite(options.stepCount, 14)));
  const width = Math.max(.35, finite(options.width, 2.4));
  const treadDepth = Math.max(.18, finite(options.treadDepth, Math.hypot(end.x - start.x, end.z - start.z) / count * 1.15));
  const thickness = Math.max(.08, finite(options.stepThickness, .26));
  const prefix = cleanId(options.id || 'stairs');
  const materialKey = String(options.materialKey || 'stone');
  const dx = (end.x - start.x) / count;
  const dy = (end.y - start.y) / count;
  const dz = (end.z - start.z) / count;
  const yaw = Math.atan2(dx, dz) * 180 / Math.PI;
  const steps = [];
  for (let index = 0; index < count; index += 1) {
    const t = (index + .5) / count;
    steps.push({
      id: `${prefix}-step-${String(index + 1).padStart(2, '0')}`,
      name: `${options.name || 'Stair'} step ${index + 1}`,
      type: 'box', category: 'stairs',
      transform: {
        position: { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, z: start.z + (end.z - start.z) * t },
        rotation: { x: 0, y: yaw, z: 0 }, scale: { x: 1, y: 1, z: 1 }
      },
      size: { x: width, y: thickness, z: treadDepth }, collision: true, visible: true,
      metadata: { generatedBy: 'world-editor-v3-stairs', stairId: prefix, stepIndex: index, materialKey, materialRole: materialKey, authoredPrimitive: 'box' }
    });
  }
  const rise = end.y - start.y;
  const run = Math.hypot(end.x - start.x, end.z - start.z);
  return {
    id: prefix, steps,
    properties: {
      start, end, stepCount: count, width, treadDepth, stepThickness: thickness,
      riserHeight: Math.abs(rise) / count, totalRise: rise, totalRun: run, yaw,
      landing: Boolean(options.landing), railingLeft: Boolean(options.railingLeft), railingRight: Boolean(options.railingRight)
    }
  };
}

export function extendStairAssembly(existingSteps, additionalCount = 5, direction = 'down') {
  const sorted = [...existingSteps].sort((a, b) => finite(a.metadata?.stepIndex) - finite(b.metadata?.stepIndex));
  if (sorted.length < 2) throw new Error('Extending stairs requires at least two existing generated steps.');
  const down = direction !== 'up';
  const anchor = down ? sorted[0] : sorted.at(-1);
  const neighbor = down ? sorted[1] : sorted.at(-2);
  const delta = {
    x: anchor.transform.position.x - neighbor.transform.position.x,
    y: anchor.transform.position.y - neighbor.transform.position.y,
    z: anchor.transform.position.z - neighbor.transform.position.z
  };
  if (!down) { delta.x *= -1; delta.y *= -1; delta.z *= -1; }
  const count = Math.max(1, Math.trunc(finite(additionalCount, 5)));
  const extension = [];
  for (let index = 1; index <= count; index += 1) {
    const step = clone(anchor);
    const signedIndex = down ? -index : sorted.length - 1 + index;
    step.id = `${anchor.metadata?.stairId || cleanId(anchor.id)}-step-${signedIndex < 0 ? `m${Math.abs(signedIndex)}` : String(signedIndex + 1).padStart(2, '0')}`;
    step.name = `${anchor.name?.replace(/ step .*/, '') || 'Stair'} extension ${index}`;
    step.transform.position.x += delta.x * index;
    step.transform.position.y += delta.y * index;
    step.transform.position.z += delta.z * index;
    step.metadata.stepIndex = signedIndex;
    extension.push(step);
  }
  return extension;
}

function recordBounds(record) {
  const position = record.transform?.position ?? record.position;
  const size = record.size;
  if (!position || !size) return null;
  const center = { x: axisValue(position, 'x'), y: axisValue(position, 'y'), z: axisValue(position, 'z') };
  const dimensions = { x: Math.abs(axisValue(size, 'x', 1)), y: Math.abs(axisValue(size, 'y', 1)), z: Math.abs(axisValue(size, 'z', 1)) };
  return {
    center, size: dimensions,
    min: { x: center.x - dimensions.x / 2, y: center.y - dimensions.y / 2, z: center.z - dimensions.z / 2 },
    max: { x: center.x + dimensions.x / 2, y: center.y + dimensions.y / 2, z: center.z + dimensions.z / 2 }
  };
}

export function findLikelyZFighting(records, threshold = .01) {
  const tolerance = Math.max(1e-5, finite(threshold, .01));
  const boxes = records.map((record) => ({ record, bounds: recordBounds(record) })).filter((entry) => entry.bounds);
  const results = [];
  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      const left = boxes[leftIndex], right = boxes[rightIndex];
      const duplicate = ['x', 'y', 'z'].every((axis) => Math.abs(left.bounds.center[axis] - right.bounds.center[axis]) <= tolerance
        && Math.abs(left.bounds.size[axis] - right.bounds.size[axis]) <= tolerance);
      if (duplicate) {
        results.push({
          severity: 'warning', code: 'duplicate-overlapping-surface', axis: null, separation: 0,
          objectId: left.record.id, otherObjectId: right.record.id,
          message: `${left.record.name || left.record.id} and ${right.record.name || right.record.id} occupy the same bounds.`
        });
        continue;
      }
      for (const axis of ['x', 'y', 'z']) {
        const axes = ['x', 'y', 'z'].filter((item) => item !== axis);
        // A likely z-fight is two thin, parallel authored sheets whose mid-planes nearly
        // coincide. Merely touching at a floor/wall/step boundary is intentionally excluded.
        if (left.bounds.size[axis] > .5 || right.bounds.size[axis] > .5) continue;
        const separation = Math.abs(left.bounds.center[axis] - right.bounds.center[axis]);
        const overlap = axes.every((other) => Math.min(left.bounds.max[other], right.bounds.max[other])
          - Math.max(left.bounds.min[other], right.bounds.min[other]) > tolerance);
        if (separation <= tolerance && overlap) {
          results.push({
            severity: 'warning', code: 'likely-z-fighting', axis, separation,
            objectId: left.record.id, otherObjectId: right.record.id,
            message: `${left.record.name || left.record.id} and ${right.record.name || right.record.id} have near-coplanar overlapping ${axis.toUpperCase()} surfaces (${separation.toFixed(4)} m).`
          });
          break;
        }
      }
    }
  }
  return results;
}

function part(id, name, position, size, materialKey, options = {}) {
  return {
    id, name, type: options.type || 'box', category: options.category || 'architecture',
    transform: { position, rotation: options.rotation || { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    size, collision: options.collision !== false, visible: true,
    metadata: { materialKey, materialRole: materialKey, authoredPrimitive: options.type || 'box', ...(options.metadata ?? {}) }
  };
}

export function makeBookshelfPrefab({ id = 'library-shelf', width = 3.4, height = 3.6, depth = .55, shelfCount = 4, doubleSided = false, bookDensity = .78 } = {}) {
  const objects = [];
  const frame = .14;
  objects.push(part(`${id}-left`, 'left frame', { x: -width / 2 + frame / 2, y: height / 2, z: 0 }, { x: frame, y: height, z: depth }, 'wood'));
  objects.push(part(`${id}-right`, 'right frame', { x: width / 2 - frame / 2, y: height / 2, z: 0 }, { x: frame, y: height, z: depth }, 'wood'));
  objects.push(part(`${id}-top`, 'crown trim', { x: 0, y: height - frame / 2, z: 0 }, { x: width + .16, y: frame, z: depth + .12 }, 'brass', { collision: false }));
  if (!doubleSided) objects.push(part(`${id}-back`, 'recessed back', { x: 0, y: height / 2, z: depth * .43 }, { x: width - frame * 2, y: height - frame, z: .1 }, 'wood'));
  for (let shelf = 0; shelf < shelfCount; shelf += 1) {
    const y = frame + shelf * ((height - frame * 2) / Math.max(1, shelfCount - 1));
    objects.push(part(`${id}-shelf-${shelf}`, `shelf ${shelf + 1}`, { x: 0, y, z: 0 }, { x: width - frame, y: .1, z: depth }, 'wood'));
    if (shelf === shelfCount - 1) continue;
    const slots = Math.max(3, Math.round((width - .35) / .24 * Math.max(.2, Math.min(1, bookDensity))));
    for (let book = 0; book < slots; book += 1) {
      if ((book + shelf * 3) % 11 === 8) continue;
      const bookWidth = .12 + (book % 3) * .035;
      const x = -width / 2 + .28 + book * ((width - .56) / slots);
      const bookHeight = .48 + ((book * 7 + shelf * 5) % 5) * .055;
      const material = ['bookGreen', 'bookRed', 'bookBlue'][(book + shelf) % 3];
      objects.push(part(`${id}-book-${shelf}-${book}`, `book ${shelf + 1}-${book + 1}`,
        { x, y: y + .1 + bookHeight / 2, z: doubleSided && book % 2 ? .13 : -.13 },
        { x: bookWidth, y: bookHeight, z: .22 }, material,
        { collision: false, rotation: { x: 0, y: 0, z: book % 7 === 5 ? 7 : 0 }, category: 'books' }));
    }
  }
  return { id, name: 'Detailed Bookshelf', kind: 'library-furniture', version: 1, objects, movingPlatforms: [], waters: [], metadata: { assetCategory: 'Library/Shelves', width, height, shelfCount, bookDensity, doubleSided } };
}

export function makeFireplacePrefab({ id = 'athenaeum-fireplace', monumental = true, flameOn = true } = {}) {
  const width = monumental ? 5.4 : 3.4;
  const height = monumental ? 4.8 : 3.1;
  const objects = [
    part(`${id}-hearth`, 'stone hearth', { x: 0, y: .18, z: -.18 }, { x: width, y: .36, z: 1.45 }, 'stone'),
    part(`${id}-left`, 'left masonry pier', { x: -width * .39, y: height * .48, z: 0 }, { x: width * .22, y: height * .86, z: 1.05 }, 'stone'),
    part(`${id}-right`, 'right masonry pier', { x: width * .39, y: height * .48, z: 0 }, { x: width * .22, y: height * .86, z: 1.05 }, 'stone'),
    part(`${id}-lintel`, 'carved lintel', { x: 0, y: height * .82, z: 0 }, { x: width * .64, y: height * .18, z: 1.05 }, 'stone'),
    part(`${id}-mantle`, 'ornate mantle', { x: 0, y: height * .94, z: -.08 }, { x: width * 1.04, y: .24, z: 1.35 }, 'woodLight'),
    part(`${id}-back`, 'dark firebox', { x: 0, y: height * .36, z: .36 }, { x: width * .55, y: height * .56, z: .18 }, 'stoneDark'),
    part(`${id}-logs`, 'hearth logs', { x: 0, y: .52, z: -.28 }, { x: width * .42, y: .24, z: .38 }, 'wood', { collision: false, rotation: { x: 0, y: 0, z: 7 } })
  ];
  if (flameOn) {
    for (const [index, x] of [-.5, 0, .5].entries()) objects.push(part(`${id}-flame-${index}`, `flame ${index + 1}`,
      { x: x * width * .22, y: .86 + (index % 2) * .16, z: -.3 }, { x: .38, y: .92 + (index % 2) * .25, z: .24 }, 'warmGlow',
      { type: 'cone', collision: false, category: 'effects', metadata: { fireVisual: true } }));
  }
  return { id, name: monumental ? 'Monumental Athenaeum Fireplace' : 'Library Fireplace', kind: 'library-fireplace', version: 1, objects, movingPlatforms: [], waters: [], metadata: { assetCategory: 'Library/Fireplaces', flameOn, light: { color: [1, .52, .2], intensity: 1.35, range: monumental ? 10 : 7 } } };
}
