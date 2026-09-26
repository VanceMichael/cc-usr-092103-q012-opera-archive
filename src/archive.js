// 读取并检查《晋戏》影像史料审定档案。
// 本模块只做结构与引用完整性检查；审定业务规则见 review.js，发布规则见 publish.js。

const REQUIRED_TOP_LEVEL = [
  'domain', 'version', 'sample_id', 'facts',
  'experts', 'opera_genres', 'persons', 'troupes', 'places',
  'repertoires', 'shoot_batches', 'sources', 'images',
  'permissions', 'captions', 'fact_corrections', 'merges', 'audit_events',
];

export function parseArchive(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (err) {
    throw new Error(`档案不是合法 JSON：${err.message}`);
  }
  for (const key of REQUIRED_TOP_LEVEL) {
    if (value[key] === undefined) {
      throw new Error(`档案缺少必要字段：${key}`);
    }
  }
  if (value.domain !== 'jin-opera-archive') {
    throw new Error(`领域标识应为 jin-opera-archive，实际为 ${value.domain}`);
  }
  if (!Array.isArray(value.facts) || value.facts.length === 0) {
    throw new Error('facts 必须为非空数组');
  }
  return value;
}

const byId = (items) => {
  const map = new Map();
  for (const item of items) {
    if (map.has(item.id)) throw new Error(`标识重复：${item.id}`);
    map.set(item.id, item);
  }
  return map;
};

function checkRefs(label, ids, validIds, errors) {
  for (const id of ids) {
    if (!validIds.has(id)) errors.push(`${label}引用了不存在的标识：${id}`);
  }
}

// 返回错误列表；空数组表示通过。不抛异常，便于审定界面逐条展示。
export function validateArchive(archive) {
  const errors = [];

  const genres = byId(archive.opera_genres);
  const persons = byId(archive.persons);
  const troupes = byId(archive.troupes);
  const places = byId(archive.places);
  const repertoires = byId(archive.repertoires);
  const batches = byId(archive.shoot_batches);
  const sources = byId(archive.sources);
  const experts = byId(archive.experts);
  const permissions = byId(archive.permissions);
  const images = byId(archive.images);
  const captions = byId(archive.captions);

  // 三十八个剧种一个不多一个不少，且全部标记为 38 种之内。
  if (archive.opera_genres.length !== 38) {
    errors.push(`剧种数量应为 38，实际为 ${archive.opera_genres.length}`);
  }
  for (const g of archive.opera_genres) {
    if (g.included_in_38 !== true) errors.push(`剧种 ${g.id} 未标记 included_in_38`);
    if (g.origin?.source_ids) checkRefs(`剧种 ${g.id} 源流`, g.origin.source_ids, sources, errors);
  }

  for (const p of archive.persons) {
    for (const v of p.name_variants) {
      checkRefs(`人物 ${p.id} 异名“${v.name}”`, v.source_ids, sources, errors);
    }
    if (p.birth_year?.source_ids) checkRefs(`人物 ${p.id} 生年`, p.birth_year.source_ids, sources, errors);
    checkRefs(`人物 ${p.id} 戏班`, p.troupe_ids ?? [], troupes, errors);
    for (const d of p.identity_disputes ?? []) {
      for (const c of d.claims) checkRefs(`争议 ${d.id} 的说法`, c.source_ids, sources, errors);
      if (d.status === 'resolved' && (!d.resolution_note || !(d.resolution_source_ids ?? []).length)) {
        errors.push(`争议 ${d.id} 标记已解决，却缺少解决说明与来源`);
      }
    }
  }

  for (const t of archive.troupes) checkRefs(`戏班 ${t.id} 地点`, t.place_ids ?? [], places, errors);
  for (const r of archive.repertoires) {
    checkRefs(`剧目 ${r.id} 剧种`, r.genre_ids, genres, errors);
    checkRefs(`剧目 ${r.id} 来源`, r.source_ids ?? [], sources, errors);
  }
  for (const b of archive.shoot_batches) checkRefs(`拍摄批次 ${b.id} 地点`, [b.place_id], places, errors);

  // 影像：原件路径、许可、批次、人物/剧目、衍生副本约束。
  for (const img of archive.images) {
    if (!img.original_file.startsWith('originals/')) {
      errors.push(`影像 ${img.id} 的原件路径必须位于 originals/ 下：${img.original_file}`);
    }
    checkRefs(`影像 ${img.id} 批次`, [img.batch_id], batches, errors);
    checkRefs(`影像 ${img.id} 许可`, [img.permission_id], permissions, errors);
    checkRefs(`影像 ${img.id} 人物`, img.depicts.person_ids, persons, errors);
    if (img.depicts.repertoire_id) checkRefs(`影像 ${img.id} 剧目`, [img.depicts.repertoire_id], repertoires, errors);
    if (img.merged_into) {
      checkRefs(`影像 ${img.id} 归并目标`, [img.merged_into], images, errors);
      if (img.merged_into === img.id) errors.push(`影像 ${img.id} 不能归并到自身`);
    }
    for (const d of img.derivatives) {
      if (d.replaces_original !== false) {
        errors.push(`衍生副本 ${d.id}（影像 ${img.id}）必须显式声明 replaces_original=false：编辑稿永远不得替换原件`);
      }
      if (d.file.startsWith('originals/')) {
        errors.push(`衍生副本 ${d.id} 不得写入 originals/ 目录`);
      }
    }
  }

  // 许可版本链：current_version 必须存在；授权只能收紧或明确放开，渠道逐项记录。
  for (const perm of archive.permissions) {
    const versions = perm.versions.map((v) => v.version);
    if (!versions.includes(perm.current_version)) {
      errors.push(`许可 ${perm.id} 的 current_version=${perm.current_version} 在版本记录中不存在`);
    }
    for (const v of perm.versions) {
      for (const channel of ['exhibition', 'publication', 'research_download', 'youth']) {
        if (typeof v.scope?.[channel] !== 'boolean') {
          errors.push(`许可 ${perm.id} v${v.version} 缺少渠道授权项：${channel}`);
        }
      }
    }
  }

  // 审定文字：引用的来源、影像、签署专家都必须存在。
  for (const c of archive.captions) {
    checkRefs(`审定文字 ${c.id} 影像`, [c.image_id], images, errors);
    checkRefs(`审定文字 ${c.id} 来源`, c.source_ids, sources, errors);
    if (c.status === 'approved' && !experts.has(c.approved_by)) {
      errors.push(`审定文字 ${c.id} 已审定通过，但签署专家 ${c.approved_by} 不存在`);
    }
    if (c.uncertainty.has_dispute && c.uncertainty.public_note.trim() === '') {
      errors.push(`审定文字 ${c.id} 声明存在争议，却缺少面向公众的存疑说明`);
    }
  }

  return errors;
}

export const indexes = {
  byId,
  images: (a) => byId(a.images),
  captionsByImage: (a) => {
    const map = new Map();
    for (const c of a.captions) {
      if (!map.has(c.image_id)) map.set(c.image_id, []);
      map.get(c.image_id).push(c);
    }
    return map;
  },
};
