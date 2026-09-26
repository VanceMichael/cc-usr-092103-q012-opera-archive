import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createStore, loadFixture, ERR,
  registerImage, addDerivative, replaceOriginal,
  draftCaption, reviewCaption, currentReleasedCaption, captionHistory,
  submitCorrection, signCorrection, applyCorrection,
  addClaim, resolveDispute,
  mergeDuplicateNegatives, mergeArtistAliases,
  grantLicense, licenseHistory,
  publishImage, withdrawPublication, publicView, researchDossier, artistDossier,
  tracePublication,
} from '../src/archive/index.js';

async function loadSample() {
  const raw = await readFile(new URL('../fixtures/archive.sample.json', import.meta.url), 'utf8');
  const store = createStore();
  loadFixture(store, JSON.parse(raw));
  return store;
}

test('样例资料覆盖三十八个剧种与人物异名', async () => {
  const store = await loadSample();
  assert.equal(store.genres.size, 38);
  const wang = store.artists.get('artist-wangce');
  assert.deepEqual(wang.names.map(n => n.value), ['王翠娥', '小电灯', '娥子', '王翠英']);
  assert.equal(wang.names.find(n => n.value === '王翠英').kind, 'misrecord');
  assert.equal(store.images.get('img-tg-001').original.fileRef, 'negatives/2003-taigu/TG2003-001.tif');
});

test('原照片不得被编辑稿替换', async () => {
  const store = await loadSample();
  assert.throws(() => replaceOriginal(store, 'img-tg-001', {}), { code: ERR.ORIGINAL_IMMUTABLE });
  const before = { ...store.images.get('img-tg-001').original };
  addDerivative(store, 'img-tg-001', { kind: 'restored', fileRef: 'restored/TG2003-001.tif', note: '划痕修复稿' });
  const image = store.images.get('img-tg-001');
  assert.deepEqual({ ...image.original }, before);
  assert.equal(image.derivatives.at(-1).kind, 'restored');
  assert.throws(() => { image.original.fileRef = 'restored/TG2003-001.tif'; }, TypeError);
});

test('说明文字审定后不可改，更正只能产生新版本', async () => {
  const store = await loadSample();
  const cap = draftCaption(store, { imageId: 'img-tg-001', text: '晋剧《打金枝》剧照，王翠娥饰升平公主，摄于太谷庙会。', author: 'curator-1' });
  assert.equal(cap.version, 2);
  reviewCaption(store, cap.id, { expertId: 'exp-ljk', action: 'approve' });
  assert.equal(cap.state, 'released');
  const history = captionHistory(store, 'img-tg-001');
  assert.equal(history.length, 2);
  assert.equal(history[0].state, 'superseded');
  assert.equal(currentReleasedCaption(store, 'img-tg-001').id, cap.id);
  assert.throws(
    () => reviewCaption(store, cap.id, { expertId: 'exp-ljk', action: 'approve' }),
    { code: ERR.RELEASED_IMMUTABLE },
  );
});

test('事实更正须附来源并取得相应专家签署', async () => {
  const store = await loadSample();
  assert.throws(
    () => submitCorrection(store, { targetType: 'artist', targetId: 'artist-wangce', field: 'birthYear', proposed: 1924 }),
    { code: ERR.MISSING_SOURCE },
  );
  const correction = submitCorrection(store, {
    targetType: 'artist',
    targetId: 'artist-wangce',
    field: 'birthYear',
    proposed: 1924,
    source: { type: 'document', ref: '1982年县志初稿人物卷', note: '与口述不一，存备考' },
  });
  assert.equal(correction.before, 1921);
  assert.throws(() => applyCorrection(store, correction.id), { code: ERR.MISSING_SIGNOFF });
  assert.throws(() => signCorrection(store, correction.id, { expertId: 'exp-zyn' }), { code: ERR.WRONG_EXPERT });
  signCorrection(store, correction.id, { expertId: 'exp-ljk' });
  applyCorrection(store, correction.id);
  assert.equal(store.artists.get('artist-wangce').birthYear, 1924);
  assert.equal(correction.state, 'applied');
});

test('重复底片归并须解释依据且原件保留', async () => {
  const store = await loadSample();
  assert.throws(
    () => mergeDuplicateNegatives(store, { survivorId: 'img-tg-001', duplicateIds: ['img-tg-002'], rationale: '', expertId: 'exp-zyn' }),
    { code: ERR.MISSING_RATIONALE },
  );
  const record = mergeDuplicateNegatives(store, {
    survivorId: 'img-tg-001',
    duplicateIds: ['img-tg-002'],
    rationale: '同机位同场连拍，画面内容一致，留TG2003-001为代表件',
    expertId: 'exp-zyn',
  });
  const dup = store.images.get('img-tg-002');
  assert.equal(dup.status, 'merged');
  assert.equal(dup.mergedInto, 'img-tg-001');
  assert.equal(dup.original.hash, 'sha256:aa11bb22cc33dd44ee55ff6600112233');
  assert.equal(record.kind, 'duplicate-negative');
  assert.throws(() => publishImage(store, { imageId: 'img-tg-002', channel: 'exhibition' }), { code: ERR.STATE_CONFLICT });
});

test('同人异名归并须解释依据并保留异名来源', async () => {
  const store = await loadSample();
  assert.throws(
    () => mergeArtistAliases(store, { survivorId: 'artist-wangce', mergedIds: ['artist-bolcui'], rationale: ' ', expertId: 'exp-ljk' }),
    { code: ERR.MISSING_RATIONALE },
  );
  const record = mergeArtistAliases(store, {
    survivorId: 'artist-wangce',
    mergedIds: ['artist-bolcui'],
    rationale: '1959年题签“玻璃翠”与2003年口述互证为同一人，留存王翠娥档案',
    expertId: 'exp-ljk',
  });
  const wang = store.artists.get('artist-wangce');
  assert.ok(wang.names.some(n => n.value === '玻璃翠' && n.source.includes('1959年')));
  assert.ok(wang.names.some(n => n.value === '李翠仙'));
  const merged = store.artists.get('artist-bolcui');
  assert.equal(merged.status, 'merged');
  assert.equal(merged.mergedInto, 'artist-wangce');
  assert.ok(store.images.get('img-qx-001').subjects.artistIds.includes('artist-wangce'));
  assert.equal(record.kind, 'artist-alias');
});

test('争议说法须注明来源，未决争议对研究者可见', async () => {
  const store = await loadSample();
  const dispute = store.disputes.get('dis-identity');
  assert.equal(dispute.state, 'open');
  assert.throws(() => addClaim(store, dispute.id, { text: '另有说法称二人为师徒' }), { code: ERR.MISSING_SOURCE });
  const dossier = researchDossier(store, 'img-tg-001');
  const identity = dossier.disputes.find(d => d.topic === 'identity');
  assert.equal(identity.claims.length, 2);
  assert.ok(identity.claims.every(c => c.source.ref));
  assert.ok(dossier.disputes.some(d => d.topic === 'birth-year'));
});

test('争议了结须相应专家签署且全部说法留档', async () => {
  const store = await loadSample();
  const dispute = store.disputes.get('dis-birth-year');
  const [first] = dispute.claims;
  assert.throws(
    () => resolveDispute(store, dispute.id, { acceptedClaimId: first.id, expertId: 'exp-zyn' }),
    { code: ERR.WRONG_EXPERT },
  );
  resolveDispute(store, dispute.id, { acceptedClaimId: first.id, expertId: 'exp-ljk', note: '以本人口述为准，县志存备考' });
  assert.equal(dispute.state, 'resolved');
  assert.equal(dispute.claims.length, 2);
  assert.deepEqual(dispute.claims.map(c => c.status), ['accepted', 'rejected']);
  const dossier = researchDossier(store, 'img-tg-001');
  assert.ok(dossier.disputes.some(d => d.id === dispute.id));
});

test('展览、出版、研究下载、青少年传播各执行自己的授权范围', async () => {
  const store = await loadSample();
  const pubEx = publishImage(store, { imageId: 'img-tg-001', channel: 'exhibition', by: 'curator-1' });
  assert.equal(pubEx.channel, 'exhibition');
  const pubYouth = publishImage(store, { imageId: 'img-tg-001', channel: 'youth' });
  assert.equal(pubYouth.conditions, '仅可使用青少年版处理稿');
  assert.throws(() => publishImage(store, { imageId: 'img-qx-001', channel: 'publication' }), { code: ERR.LICENSE_FORBIDS });
  assert.throws(() => publishImage(store, { imageId: 'img-qx-001', channel: 'youth' }), { code: ERR.LICENSE_FORBIDS });
  // 只有未定稿说明文字的影像不得发布
  assert.throws(() => publishImage(store, { imageId: 'img-tg-002', channel: 'exhibition' }), { code: ERR.NO_RELEASED_CAPTION });
  // 未登记许可的影像不得发布
  const img = registerImage(store, {
    batchId: 'batch-2011-qixian',
    negativeNo: 'QX2011-010',
    subjects: {},
    original: { fileRef: 'negatives/2011-qixian/QX2011-010.tif', hash: 'sha256:dd44ee55ff66001122334455667788' },
  });
  const cap = draftCaption(store, { imageId: img.id, text: '祁县戏台旧影。' });
  reviewCaption(store, cap.id, { expertId: 'exp-wfy', action: 'approve' });
  assert.throws(() => publishImage(store, { imageId: img.id, channel: 'research' }), { code: ERR.LICENSE_FORBIDS });
});

test('已发布影像可追到审定文字与许可版本', async () => {
  const store = await loadSample();
  const pub = publishImage(store, { imageId: 'img-tg-001', channel: 'publication', by: 'curator-1' });
  // 发布后：说明文字出新版、许可出新版
  const cap2 = draftCaption(store, { imageId: 'img-tg-001', text: '晋剧《打金枝》剧照，王翠娥（艺名小电灯）饰升平公主，2003年摄于太谷。' });
  reviewCaption(store, cap2.id, { expertId: 'exp-ljk', action: 'approve' });
  grantLicense(store, {
    imageId: 'img-tg-001',
    scopes: { exhibition: 'allow', publication: 'conditional', research: 'allow', youth: 'conditional' },
    conditions: { publication: '须标注审定版本号', youth: '仅可使用青少年版处理稿' },
    grantedBy: 'archive-committee',
  });
  const trace = tracePublication(store, pub.id);
  assert.equal(trace.caption.version, 1);
  assert.equal(trace.caption.state, 'superseded');
  assert.ok(trace.caption.reviews.length > 0);
  assert.equal(trace.license.version, 1);
  assert.equal(trace.license.state, 'superseded');
  assert.equal(trace.image.original.hash, store.images.get('img-tg-001').original.hash);
  assert.equal(trace.batch.id, 'batch-2003-taigu');
  assert.equal(licenseHistory(store, 'img-tg-001').length, 2);
});

test('公众视图只给许可允许的照片与文字', async () => {
  const store = await loadSample();
  const pub = publishImage(store, { imageId: 'img-tg-001', channel: 'youth' });
  const view = publicView(store, pub.id);
  assert.equal(view.image.rendition.kind, 'youth');
  assert.equal(view.caption.version, 1);
  assert.ok(view.caption.uncertaintyNote.includes('场次'));
  assert.equal('disputes' in view, false);
  assert.equal('reviews' in view, false);
  withdrawPublication(store, pub.id, { note: '授权复核中' });
  assert.throws(() => publicView(store, pub.id), { code: ERR.STATE_CONFLICT });
});

test('研究视图同时呈现原件、派生稿、说法来源与审定过程', async () => {
  const store = await loadSample();
  const correction = submitCorrection(store, {
    targetType: 'artist',
    targetId: 'artist-wangce',
    field: 'birthYear',
    proposed: 1924,
    source: { type: 'document', ref: '1982年县志初稿人物卷' },
  });
  signCorrection(store, correction.id, { expertId: 'exp-ljk' });
  applyCorrection(store, correction.id);
  mergeDuplicateNegatives(store, {
    survivorId: 'img-tg-001',
    duplicateIds: ['img-tg-002'],
    rationale: '同场连拍',
    expertId: 'exp-zyn',
  });
  const dossier = researchDossier(store, 'img-tg-001');
  assert.equal(dossier.image.original.fileRef, 'negatives/2003-taigu/TG2003-001.tif');
  assert.ok(dossier.image.derivatives.length >= 2);
  assert.ok(dossier.disputes.some(d => d.state === 'open'));
  assert.ok(dossier.corrections.some(c => c.id === correction.id));
  assert.ok(dossier.merges.some(m => m.kind === 'duplicate-negative'));
  assert.ok(dossier.reviews.length > 0);
  assert.equal(dossier.captions.length, 1);
});

test('人物研究视图汇总异名、影像与归并记录', async () => {
  const store = await loadSample();
  mergeArtistAliases(store, {
    survivorId: 'artist-wangce',
    mergedIds: ['artist-bolcui'],
    rationale: '题签与口述互证为同一人',
    expertId: 'exp-ljk',
  });
  const dossier = artistDossier(store, 'artist-wangce');
  assert.ok(dossier.artist.names.some(n => n.value === '玻璃翠'));
  assert.ok(dossier.images.some(i => i.id === 'img-qx-001'));
  assert.equal(dossier.merges.length, 1);
});
