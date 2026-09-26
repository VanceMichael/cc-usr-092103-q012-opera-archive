import { ERR, fail } from './errors.js';
import { nextId, mustGet, put } from './store.js';
import { now } from './util.js';
import { CHANNELS, licenseAllows, licenseHistory } from './licenses.js';
import { currentReleasedCaption, captionHistory } from './captions.js';

// 发布：把影像投放到某一渠道，绑定当时的说明文字版本与许可版本。
// 许可不允许即拒绝；被归并的影像不得直接发布，请发布留存件。
export function publishImage(store, { imageId, channel, by = null, at }) {
  if (!CHANNELS.includes(channel)) fail(ERR.INVALID, `未知传播渠道：${channel}`);
  const image = mustGet(store.images, imageId, '影像');
  if (image.status !== 'active') fail(ERR.STATE_CONFLICT, '被归并的影像不得直接发布，请发布留存件');
  const caption = currentReleasedCaption(store, imageId);
  if (!caption) fail(ERR.NO_RELEASED_CAPTION, '影像缺少已审定的说明文字，不得发布');
  const verdict = licenseAllows(store, imageId, channel);
  if (!verdict.allowed) {
    fail(ERR.LICENSE_FORBIDS, `许可不允许该影像用于 ${channel} 渠道`, { channel, reason: verdict.reason });
  }
  const publication = {
    id: nextId(store, 'pub'),
    imageId,
    channel,
    captionId: caption.id,
    captionVersion: caption.version,
    licenseId: verdict.license.id,
    licenseVersion: verdict.license.version,
    conditions: verdict.reason === 'conditional' ? verdict.conditions : '',
    state: 'live',
    publishedBy: by,
    publishedAt: at ?? now(),
    withdrawnAt: null,
    withdrawNote: '',
  };
  return put(store.publications, publication, '发布记录');
}

// 撤回：授权收紧或内容存疑时撤下，记录留档，追溯仍可达。
export function withdrawPublication(store, publicationId, { note = '', at } = {}) {
  const publication = mustGet(store.publications, publicationId, '发布记录');
  if (publication.state !== 'live') fail(ERR.STATE_CONFLICT, '发布记录已撤回');
  publication.state = 'withdrawn';
  publication.withdrawnAt = at ?? now();
  publication.withdrawNote = note;
  return publication;
}

// 公众视图：只给发布时绑定的审定文字与许可允许的稿件，
// 争议、未定稿、审定过程一律不外露。
export function publicView(store, publicationId) {
  const publication = mustGet(store.publications, publicationId, '发布记录');
  if (publication.state !== 'live') fail(ERR.STATE_CONFLICT, '该发布已撤回');
  const image = mustGet(store.images, publication.imageId, '影像');
  const caption = mustGet(store.captions, publication.captionId, '说明文字');
  const license = mustGet(store.licenses, publication.licenseId, '许可');
  return {
    publicationId: publication.id,
    channel: publication.channel,
    image: {
      id: image.id,
      negativeNo: image.negativeNo,
      scene: image.scene,
      capturedAt: image.capturedAt,
      rendition: pickRendition(image, publication.channel),
    },
    caption: {
      version: caption.version,
      text: caption.text,
      uncertaintyNote: caption.uncertaintyNote,
    },
    license: {
      version: license.version,
      conditions: publication.conditions,
    },
    publishedAt: publication.publishedAt,
  };
}

// 研究渠道给原件；公众渠道优先对口的派生稿（如青少年处理稿），没有再退到压缩稿或原件。
function pickRendition(image, channel) {
  if (channel === 'research') return { kind: 'original', fileRef: image.original.fileRef };
  const tagged = image.derivatives.find(d => d.kind === channel)
    ?? image.derivatives.find(d => d.kind === 'web');
  return tagged
    ? { kind: tagged.kind, fileRef: tagged.fileRef }
    : { kind: 'original', fileRef: image.original.fileRef };
}

// 研究视图：原始影像、各说法来源、未决争议与审定过程同时呈现。
export function researchDossier(store, imageId) {
  const image = mustGet(store.images, imageId, '影像');
  const batch = mustGet(store.batches, image.batchId, '拍摄批次');
  const captions = captionHistory(store, imageId);
  const captionIds = new Set(captions.map(c => c.id));
  const artistIds = image.subjects.artistIds;
  return {
    image,
    batch,
    subjects: {
      artists: artistIds.map(id => mustGet(store.artists, id, '艺人')),
      play: image.subjects.playId ? mustGet(store.plays, image.subjects.playId, '剧目') : null,
      troupe: image.subjects.troupeId ? mustGet(store.troupes, image.subjects.troupeId, '戏班') : null,
      location: image.subjects.locationId ? mustGet(store.locations, image.subjects.locationId, '地点') : null,
    },
    captions,
    reviews: captions.flatMap(c => c.reviews.map(r => ({ captionId: c.id, version: c.version, ...r }))),
    licenses: licenseHistory(store, imageId),
    disputes: [...store.disputes.values()].filter(d =>
      (d.subjectType === 'image' && d.subjectId === imageId)
      || (d.subjectType === 'artist' && artistIds.includes(d.subjectId))),
    corrections: [...store.corrections.values()].filter(c =>
      (c.targetType === 'image' && c.targetId === imageId)
      || (c.targetType === 'caption' && captionIds.has(c.targetId))
      || (c.targetType === 'artist' && artistIds.includes(c.targetId))),
    merges: [...store.merges.values()].filter(m =>
      m.survivorId === imageId || m.mergedIds.includes(imageId)
      || artistIds.includes(m.survivorId) || m.mergedIds.some(id => artistIds.includes(id))),
    publications: [...store.publications.values()].filter(p => p.imageId === imageId),
  };
}

// 人物研究视图：一名艺人的全部姓名与出处、相关影像、争议、更正与归并。
export function artistDossier(store, artistId) {
  const artist = mustGet(store.artists, artistId, '艺人');
  return {
    artist,
    images: [...store.images.values()].filter(img => img.subjects.artistIds.includes(artistId)),
    disputes: [...store.disputes.values()].filter(d => d.subjectType === 'artist' && d.subjectId === artistId),
    corrections: [...store.corrections.values()].filter(c => c.targetType === 'artist' && c.targetId === artistId),
    merges: [...store.merges.values()].filter(m => m.survivorId === artistId || m.mergedIds.includes(artistId)),
  };
}
