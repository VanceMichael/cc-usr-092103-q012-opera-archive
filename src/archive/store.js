import { ERR, fail } from './errors.js';

// 内存仓库：先以进程内集合落实领域模型，
// 持久化实现可沿用同一标识与版本约定替换。
export function createStore() {
  return {
    genres: new Map(),
    plays: new Map(),
    artists: new Map(),
    troupes: new Map(),
    locations: new Map(),
    batches: new Map(),
    images: new Map(),
    captions: new Map(),
    corrections: new Map(),
    disputes: new Map(),
    merges: new Map(),
    licenses: new Map(),
    publications: new Map(),
    experts: new Map(),
    sequences: new Map(),
  };
}

export function nextId(store, prefix) {
  const n = (store.sequences.get(prefix) ?? 0) + 1;
  store.sequences.set(prefix, n);
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

export function mustGet(map, id, what) {
  const value = map.get(id);
  if (value === undefined) fail(ERR.NOT_FOUND, `${what}不存在：${id}`, { id });
  return value;
}

export function put(map, record, what) {
  if (map.has(record.id)) fail(ERR.INVALID, `${what}标识重复：${record.id}`, { id: record.id });
  map.set(record.id, record);
  return record;
}
