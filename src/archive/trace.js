import { mustGet } from './store.js';

// 追溯：一张已发布影像 → 审定文字版本 → 许可版本 → 原照片与拍摄批次。
// 发布记录绑定的是版本号，之后说明文字或许可再变，历史发布仍能追到当时版本。
export function tracePublication(store, publicationId) {
  const publication = mustGet(store.publications, publicationId, '发布记录');
  const image = mustGet(store.images, publication.imageId, '影像');
  const caption = mustGet(store.captions, publication.captionId, '说明文字');
  const license = mustGet(store.licenses, publication.licenseId, '许可');
  const batch = mustGet(store.batches, image.batchId, '拍摄批次');
  return {
    publication: {
      id: publication.id,
      channel: publication.channel,
      state: publication.state,
      publishedAt: publication.publishedAt,
    },
    caption: {
      id: caption.id,
      version: caption.version,
      state: caption.state,
      text: caption.text,
      uncertaintyNote: caption.uncertaintyNote,
      reviews: caption.reviews,
    },
    license: {
      id: license.id,
      version: license.version,
      state: license.state,
      scopes: license.scopes,
      conditions: license.conditions,
    },
    image: {
      id: image.id,
      negativeNo: image.negativeNo,
      status: image.status,
      original: image.original,
    },
    batch: {
      id: batch.id,
      title: batch.title,
      shotAt: batch.shotAt,
      photographer: batch.photographer,
    },
  };
}
