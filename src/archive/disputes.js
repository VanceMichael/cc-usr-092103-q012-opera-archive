import { ERR, fail } from './errors.js';
import { nextId, mustGet, put } from './store.js';
import { expertCovers } from './experts.js';
import { now } from './util.js';

// 身份争议：同一人物的多种说法各自登记来源，未解决前对研究者全程可见。
export function openDispute(store, { id, subjectType, subjectId, topic, note = '', at }) {
  if (!['artist', 'image'].includes(subjectType)) fail(ERR.INVALID, `不支持争议的对象类型：${subjectType}`);
  mustGet(subjectType === 'artist' ? store.artists : store.images, subjectId, '争议对象');
  if (!topic) fail(ERR.INVALID, '争议须说明议题');
  const dispute = {
    id: id ?? nextId(store, 'dis'),
    subjectType,
    subjectId,
    topic,
    note,
    state: 'open',
    claims: [],
    resolution: null,
    openedAt: at ?? now(),
  };
  return put(store.disputes, dispute, '争议');
}

// 登记一种说法：每种说法必须注明来源，否则拒绝。
export function addClaim(store, disputeId, { text, source, at }) {
  const dispute = mustGet(store.disputes, disputeId, '争议');
  if (dispute.state !== 'open') fail(ERR.STATE_CONFLICT, '争议已了结，不再追加说法');
  if (!text) fail(ERR.INVALID, '说法内容不能为空');
  if (!source?.ref) fail(ERR.MISSING_SOURCE, '每种说法都须注明来源');
  const claim = {
    id: nextId(store, 'claim'),
    text,
    source: { type: source.type ?? 'oral', ref: source.ref, note: source.note ?? '' },
    status: 'unresolved',
    at: at ?? now(),
  };
  dispute.claims.push(claim);
  return claim;
}

// 了结争议：由相应专家签署采纳其中一说；其余说法标记为未采纳但全部保留，
// 不确定性留在档案里，不被抹平。
export function resolveDispute(store, disputeId, { acceptedClaimId, expertId, note = '', at }) {
  const dispute = mustGet(store.disputes, disputeId, '争议');
  if (dispute.state !== 'open') fail(ERR.STATE_CONFLICT, '争议已了结');
  if (!expertCovers(store, expertId, dispute.subjectType, dispute.subjectId)) {
    fail(ERR.WRONG_EXPERT, '争议须由相应领域专家签署了结');
  }
  const accepted = dispute.claims.find(c => c.id === acceptedClaimId);
  if (!accepted) fail(ERR.NOT_FOUND, '被采纳的说法不存在', { acceptedClaimId });
  for (const claim of dispute.claims) {
    claim.status = claim.id === acceptedClaimId ? 'accepted' : 'rejected';
  }
  dispute.state = 'resolved';
  dispute.resolution = { acceptedClaimId, expertId, note, at: at ?? now() };
  return dispute;
}
