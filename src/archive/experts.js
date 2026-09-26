import { mustGet } from './store.js';

// 目标涉及的剧种：签署是否“相应”以此判断。
export function targetGenreIds(store, targetType, targetId) {
  switch (targetType) {
    case 'artist':
      return mustGet(store.artists, targetId, '艺人').genreIds;
    case 'play':
      return [mustGet(store.plays, targetId, '剧目').genreId];
    case 'troupe':
      return [mustGet(store.troupes, targetId, '戏班').genreId];
    case 'batch':
      return mustGet(store.batches, targetId, '拍摄批次').genreIds;
    case 'image': {
      const image = mustGet(store.images, targetId, '影像');
      const fromBatch = mustGet(store.batches, image.batchId, '拍摄批次').genreIds;
      const fromArtists = image.subjects.artistIds.flatMap(id => store.artists.get(id)?.genreIds ?? []);
      return [...new Set([...fromBatch, ...fromArtists])];
    }
    case 'caption':
      return targetGenreIds(store, 'image', mustGet(store.captions, targetId, '说明文字').imageId);
    case 'dispute': {
      const dispute = mustGet(store.disputes, targetId, '争议');
      return targetGenreIds(store, dispute.subjectType, dispute.subjectId);
    }
    default:
      return [];
  }
}

// 相应专家：专长覆盖目标剧种，或影像类目标的影像档案专家（field:photo），或总审定（field:all）。
export function expertCovers(store, expertId, targetType, targetId) {
  const expert = mustGet(store.experts, expertId, '专家');
  if (expert.specialties.includes('field:all')) return true;
  if (targetType === 'image' && expert.specialties.includes('field:photo')) return true;
  return targetGenreIds(store, targetType, targetId).some(g => expert.specialties.includes(`genre:${g}`));
}
