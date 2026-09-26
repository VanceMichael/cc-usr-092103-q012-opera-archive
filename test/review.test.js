import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseArchive } from '../src/archive.js';
import {
  runReview,
  reviewOriginalIntegrity,
  reviewCorrections,
  reviewMerges,
  reviewCaptionChain,
  personView,
} from '../src/review.js';

async function loadSample() {
  const raw = await readFile(new URL('../fixtures/archive.sample.json', import.meta.url), 'utf8');
  return parseArchive(raw);
}

test('样例档案通过全部审定检查', async () => {
  const archive = await loadSample();
  const report = runReview(archive);
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors, null, 2));
});

test('原件哈希被改动会报错', async () => {
  const archive = await loadSample();
  const findings = reviewOriginalIntegrity(archive, { 'IMG-0001': 'f'.repeat(64) });
  assert.ok(findings.some((f) => f.code === 'checksum_mismatch'));
});

test('编辑稿写入 originals 目录会被拦截', async () => {
  const archive = await loadSample();
  archive.images[0].derivatives.push({
    id: 'D999', file: 'originals/1998/B1998-04/IMG-0001.tif', purpose: '试图覆盖原件', edited: true, replaces_original: false,
  });
  const findings = reviewOriginalIntegrity(archive);
  assert.ok(findings.some((f) => f.code === 'original_replaced'));
});

test('已生效更正必须有专家签署', async () => {
  const archive = await loadSample();
  archive.fact_corrections[0].signoffs = [];
  const findings = reviewCorrections(archive);
  assert.ok(findings.some((f) => f.code === 'accepted_without_signoff'));
});

test('更正必须附来源', async () => {
  const archive = await loadSample();
  archive.fact_corrections[1].source_ids = [];
  const findings = reviewCorrections(archive);
  assert.ok(findings.some((f) => f.code === 'correction_without_source'));
});

test('归并必须写明依据与来源', async () => {
  const archive = await loadSample();
  archive.merges[0].basis = '';
  archive.merges[0].source_ids = [];
  const findings = reviewMerges(archive);
  assert.ok(findings.some((f) => f.code === 'merge_without_basis'));
});

test('归并成员必须存在且类型相符', async () => {
  const archive = await loadSample();
  archive.merges[1].members = ['P004', 'IMG-0001'];
  const findings = reviewMerges(archive);
  assert.ok(findings.some((f) => f.code === 'merge_wrong_member_type'));
});

test('重复底片副本缺少指向会被提示', async () => {
  const archive = await loadSample();
  delete archive.images.find((i) => i.id === 'IMG-0002').merged_into;
  const findings = reviewMerges(archive);
  assert.ok(findings.some((f) => f.code === 'merge_pointer_missing'));
});

test('现行审定文字不得抹去历史争议', async () => {
  const archive = await loadSample();
  const current = archive.captions.find((c) => c.id === 'C003');
  current.uncertainty = { has_dispute: false, dispute_ids: [], public_note: '' };
  const findings = reviewCaptionChain(archive);
  assert.ok(findings.some((f) => f.code === 'uncertainty_erased'));
});

test('人物视图汇集异名、归并记录与未决争议', async () => {
  const archive = await loadSample();
  const view = personView(archive, 'P004');
  assert.equal(view.merged_records.length, 1);
  assert.equal(view.merged_records[0].id, 'P005');
  const disputed = personView(archive, 'P001');
  assert.equal(disputed.open_disputes.length, 1);
  assert.equal(disputed.open_disputes[0].claims.length, 2);
});
