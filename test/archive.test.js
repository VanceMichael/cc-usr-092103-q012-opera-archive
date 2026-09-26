import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseArchive, validateArchive } from '../src/archive.js';

async function loadSample() {
  const raw = await readFile(new URL('../fixtures/archive.sample.json', import.meta.url), 'utf8');
  return parseArchive(raw);
}

test('样例档案可解析且领域标识正确', async () => {
  const archive = await loadSample();
  assert.equal(archive.domain, 'jin-opera-archive');
  assert.ok(archive.version >= 2);
});

test('样例档案覆盖三十八个剧种且引用完整', async () => {
  const archive = await loadSample();
  assert.equal(archive.opera_genres.length, 38);
  assert.equal(validateArchive(archive).length, 0);
});

test('剧种数量不是 38 会被发现', async () => {
  const archive = await loadSample();
  archive.opera_genres = archive.opera_genres.slice(0, 37);
  const errors = validateArchive(archive);
  assert.ok(errors.some((e) => e.includes('剧种数量应为 38')));
});

test('衍生副本不得声明替换原件', async () => {
  const archive = await loadSample();
  archive.images[0].derivatives[0].replaces_original = true;
  const errors = validateArchive(archive);
  assert.ok(errors.some((e) => e.includes('replaces_original')));
});

test('许可 current_version 必须落在版本记录里', async () => {
  const archive = await loadSample();
  archive.permissions[0].current_version = 9;
  const errors = validateArchive(archive);
  assert.ok(errors.some((e) => e.includes('current_version')));
});

test('缺少必要字段的档案被拒绝', () => {
  assert.throws(() => parseArchive('{"domain":"jin-opera-archive"}'), /缺少必要字段/);
});
