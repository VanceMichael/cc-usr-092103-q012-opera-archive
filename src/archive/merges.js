import { ERR, fail } from './errors.js';
import { nextId, mustGet, put } from './store.js';
import { expertCovers } from './experts.js';
import { now } from './util.js';

// 重复底片归并：原件一律保留在库，仅标记归并关系；归并必须解释依据。
export function mergeDuplicateNegatives(store, { survivorId, duplicateIds, rationale, expertId, at }) {
  if (!rationale || !rationale.trim()) fail(ERR.MISSING_RATIONALE, '归并重复底片必须解释依据');
  const survivor = mustGet(store.images, survivorId, '影像');
  if (survivor.status !== 'active') fail(ERR.STATE_CONFLICT, '留存件须为在册影像');
  if (!expertCovers(store, expertId, 'image', survivorId)) fail(ERR.WRONG_EXPERT, '归并须由相应专家决定');
  const snapshot = [];
  for (const duplicateId of duplicateIds) {
    if (duplicateId === survivorId) fail(ERR.INVALID, '留存件不能同时是被归并件');
    const duplicate = mustGet(store.images, duplicateId, '影像');
    if (duplicate.status !== 'active') fail(ERR.STATE_CONFLICT, `影像已被归并：${duplicateId}`);
    duplicate.status = 'merged';
    duplicate.mergedInto = survivorId;
    // 原照片不动，只记下归并时的状态备查
    snapshot.push({ id: duplicate.id, negativeNo: duplicate.negativeNo, original: duplicate.original });
  }
  const record = {
    id: nextId(store, 'mrg'),
    kind: 'duplicate-negative',
    survivorId,
    mergedIds: [...duplicateIds],
    rationale,
    expertId,
    snapshot,
    at: at ?? now(),
  };
  return put(store.merges, record, '归并');
}

// 同人异名归并：重复登记的艺人档案并入留存档案，
// 异名连同各自来源一并搬入，影像与争议的指向改挂留存档案，原档案保留。
export function mergeArtistAliases(store, { survivorId, mergedIds, rationale, expertId, at }) {
  if (!rationale || !rationale.trim()) fail(ERR.MISSING_RATIONALE, '归并同人异名必须解释依据');
  const survivor = mustGet(store.artists, survivorId, '艺人');
  if (survivor.status !== 'active') fail(ERR.STATE_CONFLICT, '留存档案须为在册艺人');
  if (!expertCovers(store, expertId, 'artist', survivorId)) fail(ERR.WRONG_EXPERT, '归并须由相应专家决定');
  for (const mergedId of mergedIds) {
    if (mergedId === survivorId) fail(ERR.INVALID, '留存档案不能同时是被归并档案');
    const merged = mustGet(store.artists, mergedId, '艺人');
    if (merged.status !== 'active') fail(ERR.STATE_CONFLICT, `艺人已被归并：${mergedId}`);
    for (const name of merged.names) {
      survivor.names.push({
        id: nextId(store, 'name'),
        value: name.value,
        kind: name.kind === 'birth' ? 'alias' : name.kind,
        source: name.source,
      });
    }
    for (const image of store.images.values()) {
      const index = image.subjects.artistIds.indexOf(mergedId);
      if (index >= 0) {
        image.subjects.artistIds.splice(index, 1);
        if (!image.subjects.artistIds.includes(survivorId)) image.subjects.artistIds.push(survivorId);
      }
    }
    for (const dispute of store.disputes.values()) {
      if (dispute.subjectType === 'artist' && dispute.subjectId === mergedId) dispute.subjectId = survivorId;
    }
    merged.status = 'merged';
    merged.mergedInto = survivorId;
  }
  const record = {
    id: nextId(store, 'mrg'),
    kind: 'artist-alias',
    survivorId,
    mergedIds: [...mergedIds],
    rationale,
    expertId,
    at: at ?? now(),
  };
  return put(store.merges, record, '归并');
}
