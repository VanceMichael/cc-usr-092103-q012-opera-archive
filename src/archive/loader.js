import { addGenre, addPlay, addTroupe, addLocation, addExpert, addArtist, addBatch } from './catalog.js';
import { registerImage, addDerivative } from './images.js';
import { draftCaption, reviewCaption } from './captions.js';
import { grantLicense } from './licenses.js';
import { openDispute, addClaim } from './disputes.js';

// 将样例资料装入仓库：走与线上相同的服务入口，种子数据同样遵守不变量。
export function loadFixture(store, data) {
  for (const genre of data.genres ?? []) addGenre(store, genre);
  for (const location of data.locations ?? []) addLocation(store, location);
  for (const troupe of data.troupes ?? []) addTroupe(store, troupe);
  for (const play of data.plays ?? []) addPlay(store, play);
  for (const expert of data.experts ?? []) addExpert(store, expert);
  for (const artist of data.artists ?? []) addArtist(store, artist);
  for (const batch of data.batches ?? []) addBatch(store, batch);
  for (const entry of data.images ?? []) {
    const { captions = [], derivatives = [], license, ...imageData } = entry;
    const image = registerImage(store, imageData);
    for (const derivative of derivatives) addDerivative(store, image.id, derivative);
    for (const captionData of captions) {
      const { state, reviewedBy, reviewNote, ...rest } = captionData;
      const caption = draftCaption(store, { imageId: image.id, ...rest });
      if (state === 'released') {
        reviewCaption(store, caption.id, { expertId: reviewedBy, action: 'approve', note: reviewNote ?? '' });
      }
    }
    if (license) grantLicense(store, { imageId: image.id, ...license });
  }
  for (const entry of data.disputes ?? []) {
    const { claims = [], ...disputeData } = entry;
    const dispute = openDispute(store, disputeData);
    for (const claim of claims) addClaim(store, dispute.id, claim);
  }
  return store;
}
