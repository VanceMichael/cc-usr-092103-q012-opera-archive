import { ERR, fail } from './errors.js';
import { nextId, mustGet, put } from './store.js';
import { now } from './util.js';

// 说明文字按版本管理：每一版独立留档，已发布版本不可再改；
// 事实更正只能产生新版本，旧版本转为“被取代”并保留备查。
export function draftCaption(store, { imageId, text, author = null, uncertaintyNote = '', correctionId = null, at }) {
  mustGet(store.images, imageId, '影像');
  if (!text) fail(ERR.INVALID, '说明文字不能为空');
  const version = captionHistory(store, imageId).reduce((max, c) => Math.max(max, c.version), 0) + 1;
  const caption = {
    id: nextId(store, 'cap'),
    imageId,
    version,
    text,
    uncertaintyNote,
    correctionId,
    state: 'draft',
    author,
    reviews: [],
    releasedAt: null,
    draftedAt: at ?? now(),
  };
  return put(store.captions, caption, '说明文字');
}

// 审定：专家签署意见；通过后该版成为影像唯一的发布版说明，
// 同一影像此前的发布版自动转为“被取代”。
export function reviewCaption(store, captionId, { expertId, action, note = '', at }) {
  const caption = mustGet(store.captions, captionId, '说明文字');
  mustGet(store.experts, expertId, '专家');
  if (caption.state === 'released' || caption.state === 'superseded') {
    fail(ERR.RELEASED_IMMUTABLE, '已发布的说明文字不得再改动，事实更正请走更正流程产生新版本');
  }
  if (!['approve', 'reject'].includes(action)) fail(ERR.INVALID, `未知审定动作：${action}`);
  caption.reviews.push(Object.freeze({ expertId, action, note, at: at ?? now() }));
  if (action === 'approve') {
    for (const other of store.captions.values()) {
      if (other.imageId === caption.imageId && other.state === 'released') other.state = 'superseded';
    }
    caption.state = 'released';
    caption.releasedAt = at ?? now();
  } else {
    caption.state = 'rejected';
  }
  return caption;
}

export function currentReleasedCaption(store, imageId) {
  return [...store.captions.values()].find(c => c.imageId === imageId && c.state === 'released') ?? null;
}

export function captionHistory(store, imageId) {
  return [...store.captions.values()].filter(c => c.imageId === imageId).sort((a, b) => a.version - b.version);
}
