import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseArchive } from '../src/archive.js';
import { CHANNELS, checkChannel, buildManifest, tracePublishedImage } from '../src/publish.js';

async function loadSample() {
  const raw = await readFile(new URL('../fixtures/archive.sample.json', import.meta.url), 'utf8');
  return parseArchive(raw);
}

test('四个渠道各自执行授权范围', async () => {
  const archive = await loadSample();
  // PERM-01 v2 全渠道授权
  for (const channel of CHANNELS) {
    assert.equal(checkChannel(archive, 'IMG-0001', channel).ok, true, channel);
  }
  // PERM-02 v1 未授权出版与青少年传播
  assert.equal(checkChannel(archive, 'IMG-0003', 'publication').ok, false);
  assert.equal(checkChannel(archive, 'IMG-0003', 'youth').ok, false);
  assert.equal(checkChannel(archive, 'IMG-0003', 'research_download').ok, true);
});

test('重复底片副本不直接发布，须走保留件', async () => {
  const archive = await loadSample();
  const check = checkChannel(archive, 'IMG-0002', 'exhibition');
  assert.equal(check.ok, false);
  assert.match(check.reason, /IMG-0001/);
});

test('青少年渠道要求水印副本', async () => {
  const archive = await loadSample();
  // 移除水印衍生件后，IMG-0001 不得进入青少年渠道
  const img = archive.images.find((i) => i.id === 'IMG-0001');
  img.derivatives = img.derivatives.filter((d) => !d.file.includes('_wm'));
  const check = checkChannel(archive, 'IMG-0001', 'youth');
  assert.equal(check.ok, false);
  assert.match(check.reason, /水印/);
});

test('发布清单可追溯到审定文字与许可版本', async () => {
  const archive = await loadSample();
  const manifest = buildManifest(archive, 'exhibition', ['IMG-0001']);
  assert.equal(manifest.items.length, 1);
  const item = manifest.items[0];
  assert.equal(item.caption.id, 'C003');
  assert.equal(item.caption.version, 2);
  assert.equal(item.permission.id, 'PERM-01');
  assert.equal(item.permission.version, 2);
  assert.equal(item.original_file.startsWith('originals/'), true);
});

test('未决争议随发布清单同行，不被抹平', async () => {
  const archive = await loadSample();
  const manifest = buildManifest(archive, 'exhibition', ['IMG-0001']);
  const item = manifest.items[0];
  assert.equal(item.uncertainty.has_dispute, true);
  assert.deepEqual(item.uncertainty.dispute_ids, ['D001']);
  assert.match(item.uncertainty.public_note, /争议/);
});

test('未授权渠道进入 blocked 而不是静默混入', async () => {
  const archive = await loadSample();
  const manifest = buildManifest(archive, 'publication', ['IMG-0001', 'IMG-0003']);
  assert.deepEqual(manifest.items.map((i) => i.image_id), ['IMG-0001']);
  assert.deepEqual(manifest.blocked.map((b) => b.image_id), ['IMG-0003']);
  assert.match(manifest.blocked[0].reason, /未授权/);
});

test('从清单行可追溯完整审定链', async () => {
  const archive = await loadSample();
  const manifest = buildManifest(archive, 'exhibition', ['IMG-0001']);
  const trace = tracePublishedImage(archive, manifest.items[0]);
  assert.equal(trace.caption.id, 'C003');
  assert.equal(trace.permission.id, 'PERM-01');
  assert.ok(trace.accepted_corrections.some((fc) => fc.id === 'FC001'));
  assert.ok(trace.merges.some((m) => m.id === 'M001'));
  assert.ok(trace.audit_trail.length >= 2);
});

test('青少年渠道清单使用水印副本文件', async () => {
  const archive = await loadSample();
  const manifest = buildManifest(archive, 'youth', ['IMG-0001']);
  assert.match(manifest.items[0].file, /_wm/);
});
