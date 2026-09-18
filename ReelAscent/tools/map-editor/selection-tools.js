const clone = (value) => value == null ? value : structuredClone(value);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function selectionKey(item) {
  return item ? `${String(item.kind || 'object')}\u0000${String(item.id)}` : '';
}

export function normalizeObjectSelection(items = []) {
  const result = [];
  const seen = new Set();
  for (const item of items) {
    if (!item?.id) continue;
    const normalized = { ...item, id: String(item.id) };
    const key = selectionKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function updateObjectSelection(current = [], target = null, mode = 'replace') {
  const selection = normalizeObjectSelection(current);
  if (!target) return mode === 'replace' ? [] : selection;
  const normalized = { ...target, id: String(target.id) };
  const key = selectionKey(normalized);
  const index = selection.findIndex((item) => selectionKey(item) === key);
  if (mode === 'toggle') {
    if (index >= 0) selection.splice(index, 1);
    else selection.push(normalized);
    return selection;
  }
  if (mode === 'add') {
    if (index >= 0) selection.splice(index, 1);
    selection.push(normalized);
    return selection;
  }
  return [normalized];
}

export function rangeObjectSelection(orderedItems = [], anchorId, targetId, current = [], additive = false) {
  const anchor = orderedItems.findIndex((item) => String(item.id) === String(anchorId));
  const target = orderedItems.findIndex((item) => String(item.id) === String(targetId));
  if (anchor < 0 || target < 0) return updateObjectSelection(current, orderedItems[target] || null, additive ? 'add' : 'replace');
  const start = Math.min(anchor, target);
  const end = Math.max(anchor, target);
  return normalizeObjectSelection([...(additive ? current : []), ...orderedItems.slice(start, end + 1)]);
}

export function recordPosition(record) {
  return record?.transform?.position ?? record?.position ?? null;
}

export function selectionPivot(records = [], activeRecord = null, mode = 'center') {
  const positioned = records.filter((record) => recordPosition(record));
  if (!positioned.length) return { x: 0, y: 0, z: 0 };
  if (mode === 'active' && recordPosition(activeRecord)) return clone(recordPosition(activeRecord));
  const total = positioned.reduce((sum, record) => {
    const position = recordPosition(record);
    sum.x += finite(position.x); sum.y += finite(position.y); sum.z += finite(position.z);
    return sum;
  }, { x: 0, y: 0, z: 0 });
  return { x: total.x / positioned.length, y: total.y / positioned.length, z: total.z / positioned.length };
}

function rotateVector(vector, rotation = {}) {
  let { x, y, z } = vector;
  const rx = finite(rotation.x) * Math.PI / 180;
  const ry = finite(rotation.y) * Math.PI / 180;
  const rz = finite(rotation.z) * Math.PI / 180;
  if (rx) [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  if (ry) [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  if (rz) [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  return { x, y, z };
}

function addRotation(record, rotation) {
  const target = record?.transform?.rotation ?? record?.rotation;
  if (!target) return;
  for (const axis of ['x', 'y', 'z']) target[axis] = finite(target[axis]) + finite(rotation?.[axis]);
}

function scaleRecord(record, scale) {
  const sx = Math.max(.001, finite(scale?.x, 1));
  const sy = Math.max(.001, finite(scale?.y, 1));
  const sz = Math.max(.001, finite(scale?.z, 1));
  if (record?.transform?.scale && !record?.size) {
    record.transform.scale.x = finite(record.transform.scale.x, 1) * sx;
    record.transform.scale.y = finite(record.transform.scale.y, 1) * sy;
    record.transform.scale.z = finite(record.transform.scale.z, 1) * sz;
  } else if (record?.size) {
    record.size.x = Math.max(.01, finite(record.size.x, 1) * sx);
    record.size.y = Math.max(.01, finite(record.size.y, 1) * sy);
    record.size.z = Math.max(.01, finite(record.size.z, 1) * sz);
  } else if (record?.radii) {
    record.radii.x = Math.max(.01, finite(record.radii.x, 1) * sx);
    record.radii.z = Math.max(.01, finite(record.radii.z, 1) * sz);
    if (record.depthMeters != null) record.depthMeters = Math.max(.01, finite(record.depthMeters, 1) * sy);
  }
}

export function transformObjectRecords(records = [], options = {}) {
  const result = records.map(clone);
  const activeIndex = Math.max(0, Math.min(result.length - 1, Number(options.activeIndex) || 0));
  const pivotMode = options.pivotMode || 'center';
  const pivot = options.pivot || selectionPivot(result, result[activeIndex], pivotMode);
  const translation = options.translation || { x: 0, y: 0, z: 0 };
  const rotation = options.rotation || { x: 0, y: 0, z: 0 };
  const scale = options.scale || { x: 1, y: 1, z: 1 };
  for (const record of result) {
    const position = recordPosition(record);
    const localPivot = pivotMode === 'individual' && position ? { ...position } : pivot;
    if (position) {
      let offset = {
        x: finite(position.x) - finite(localPivot.x),
        y: finite(position.y) - finite(localPivot.y),
        z: finite(position.z) - finite(localPivot.z)
      };
      offset = { x: offset.x * finite(scale.x, 1), y: offset.y * finite(scale.y, 1), z: offset.z * finite(scale.z, 1) };
      offset = rotateVector(offset, rotation);
      position.x = finite(localPivot.x) + offset.x + finite(translation.x);
      position.y = finite(localPivot.y) + offset.y + finite(translation.y);
      position.z = finite(localPivot.z) + offset.z + finite(translation.z);
    }
    addRotation(record, rotation);
    scaleRecord(record, scale);
    if (record?.path?.points?.length) {
      for (const point of record.path.points) {
        let offset = { x: finite(point.x) - pivot.x, y: finite(point.y) - pivot.y, z: finite(point.z) - pivot.z };
        offset = { x: offset.x * finite(scale.x, 1), y: offset.y * finite(scale.y, 1), z: offset.z * finite(scale.z, 1) };
        offset = rotateVector(offset, rotation);
        point.x = pivot.x + offset.x + finite(translation.x);
        point.y = pivot.y + offset.y + finite(translation.y);
        point.z = pivot.z + offset.z + finite(translation.z);
      }
    }
  }
  return { records: result, pivot };
}

export function duplicateObjectRecords(records = [], idFactory, offset = { x: 1.5, y: 0, z: 1.5 }) {
  const used = new Set();
  return records.map((record, index) => {
    const copy = clone(record);
    let id = String(idFactory(record, index));
    while (used.has(id)) id = String(idFactory(record, index + used.size + 1));
    used.add(id);
    copy.id = id;
    copy.name = `${record.name || record.id || 'Object'} Copy`;
    const position = recordPosition(copy);
    if (position) {
      position.x = finite(position.x) + finite(offset.x);
      position.y = finite(position.y) + finite(offset.y);
      position.z = finite(position.z) + finite(offset.z);
    }
    if (copy.path?.points) for (const point of copy.path.points) {
      point.x = finite(point.x) + finite(offset.x);
      point.y = finite(point.y) + finite(offset.y);
      point.z = finite(point.z) + finite(offset.z);
    }
    return copy;
  });
}
