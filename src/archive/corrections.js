import { ERR, fail } from './errors.js';
import { nextId, mustGet, put } from './store.js';
import { expertCovers } from './experts.js';
import { now } from './util.js';

// 允许更正的字段：只放事实性字段；姓名异动走归并，说明文字走新版本。
const AMENDABLE = Object.freeze({
  artist: ['birthYear', 'deathYear', 'bio', 'note'],
  genre: ['origin', 'region', 'note'],
  play: ['synopsis'],
  troupe: ['activeFrom', 'activeTo', 'note'],
  location: ['name', 'note'],
  batch: ['title', 'shotAt', 'photographer', 'note'],
  image: ['capturedAt', 'scene', 'note'],
});

const COLLECTIONS = Object.freeze({
  artist: 'artists',
  genre: 'genres',
  play: 'plays',
  troupe: 'troupes',
  location: 'locations',
  batch: 'batches',
  image: 'images',
});

function targetOf(store, targetType, targetId) {
  const collection = COLLECTIONS[targetType];
  if (!collection) fail(ERR.INVALID, `不支持更正的对象类型：${targetType}`);
  return mustGet(store[collection], targetId, '更正对象');
}

// 提交更正：必须附来源（口述、文献、实物等），否则拒绝；前后值都留档。
export function submitCorrection(store, { targetType, targetId, field, proposed, source, note = '', at }) {
  const record = targetOf(store, targetType, targetId);
  if (!AMENDABLE[targetType].includes(field)) fail(ERR.INVALID, `该字段不支持更正：${targetType}.${field}`);
  if (!source?.ref) fail(ERR.MISSING_SOURCE, '事实更正须附来源');
  const correction = {
    id: nextId(store, 'cor'),
    targetType,
    targetId,
    field,
    before: record[field] ?? null,
    after: proposed,
    source: Object.freeze({ type: source.type ?? 'document', ref: source.ref, note: source.note ?? '' }),
    note,
    state: 'pending',
    signoff: null,
    submittedAt: at ?? now(),
  };
  return put(store.corrections, correction, '更正');
}

// 签署：须由相应领域的专家签署，专长不覆盖目标即拒绝。
export function signCorrection(store, correctionId, { expertId, at }) {
  const correction = mustGet(store.corrections, correctionId, '更正');
  if (correction.state !== 'pending') fail(ERR.STATE_CONFLICT, '仅待签署的更正可以签署');
  if (!expertCovers(store, expertId, correction.targetType, correction.targetId)) {
    fail(ERR.WRONG_EXPERT, '事实更正须取得相应领域专家的签署');
  }
  correction.signoff = Object.freeze({ expertId, at: at ?? now() });
  correction.state = 'signed';
  return correction;
}

// 生效：未签署不得生效；生效只改当前字段，原值留在更正档案中备查。
export function applyCorrection(store, correctionId, { at } = {}) {
  const correction = mustGet(store.corrections, correctionId, '更正');
  if (correction.state === 'pending') fail(ERR.MISSING_SIGNOFF, '更正在取得相应专家签署前不得生效');
  if (correction.state !== 'signed') fail(ERR.STATE_CONFLICT, '更正已生效或已作废');
  const record = targetOf(store, correction.targetType, correction.targetId);
  record[correction.field] = correction.after;
  correction.state = 'applied';
  correction.appliedAt = at ?? now();
  return correction;
}
