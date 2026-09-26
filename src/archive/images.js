import { ERR, fail } from './errors.js';
import { nextId, mustGet, put } from './store.js';

// 影像同时记录台前与幕后。
export const SCENES = Object.freeze(['stage', 'backstage']);

// 登记原始影像：原照片（底片扫描件）一旦登记即冻结，
// 之后的裁剪、修复、压缩等编辑稿一律作为派生件挂接，不得顶替原件。
export function registerImage(store, { id, batchId, negativeNo, capturedAt = null, scene = 'stage', subjects = {}, original, note = '' }) {
  mustGet(store.batches, batchId, '拍摄批次');
  if (!negativeNo) fail(ERR.INVALID, '影像须具备底片编号');
  if (!SCENES.includes(scene)) fail(ERR.INVALID, `未知影像场景：${scene}`);
  if (!original?.fileRef || !original?.hash) fail(ERR.INVALID, '原照片须具备文件引用与校验值');
  const artistIds = [...(subjects.artistIds ?? [])];
  for (const a of artistIds) mustGet(store.artists, a, '艺人');
  if (subjects.playId) mustGet(store.plays, subjects.playId, '剧目');
  if (subjects.troupeId) mustGet(store.troupes, subjects.troupeId, '戏班');
  if (subjects.locationId) mustGet(store.locations, subjects.locationId, '地点');
  const image = {
    id: id ?? nextId(store, 'img'),
    batchId,
    negativeNo,
    capturedAt,
    scene,
    subjects: {
      artistIds,
      playId: subjects.playId ?? null,
      troupeId: subjects.troupeId ?? null,
      locationId: subjects.locationId ?? null,
    },
    original: Object.freeze({
      fileRef: original.fileRef,
      hash: original.hash,
      registeredAt: original.registeredAt ?? null,
    }),
    derivatives: [],
    status: 'active',
    mergedInto: null,
    note,
  };
  return put(store.images, image, '影像');
}

// 编辑稿只能追加为派生件（展览压缩稿、青少年处理稿、修复稿等），原照片不动。
export function addDerivative(store, imageId, { kind, fileRef, note = '' }) {
  const image = mustGet(store.images, imageId, '影像');
  if (!kind || !fileRef) fail(ERR.INVALID, '派生件须说明类型与文件引用');
  const derivative = Object.freeze({ id: nextId(store, 'der'), kind, fileRef, note });
  image.derivatives.push(derivative);
  return derivative;
}

// 原照片不得被编辑稿替换：此入口永远拒绝，编辑稿请走 addDerivative。
export function replaceOriginal() {
  fail(ERR.ORIGINAL_IMMUTABLE, '原照片不得被编辑稿替换，编辑稿请登记为派生件');
}
