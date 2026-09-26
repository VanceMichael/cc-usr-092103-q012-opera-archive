// 审定后台规则层：
// - 原件影像不可被编辑稿替换（只可新增 derivatives 副本）
// - 事实更正必须附来源；accepted 的更正必须有相应专家签署
// - 重复底片 / 同人异名可以归并，但必须写明依据、来源，且成员记录保留
// - 审定文字按版本留存，已发布影像必须能指回一条 approved 文字

export function reviewOriginalIntegrity(archive, currentChecksums = {}) {
  const findings = [];
  for (const img of archive.images) {
    // 编辑稿只能出现在 derivatives 中，且路径不得落在 originals/。
    for (const d of img.derivatives ?? []) {
      if (d.file.startsWith('originals/') || d.replaces_original !== false) {
        findings.push({ level: 'error', code: 'original_replaced', target: img.id,
          message: `衍生副本 ${d.id} 试图覆盖原件，封存原件不允许被替换` });
      }
    }
    // 若封存系统提供了当前哈希，则与登记哈希比对；不一致即视为原件被改动。
    const current = currentChecksums[img.id];
    if (current && current !== img.sha256) {
      findings.push({ level: 'error', code: 'checksum_mismatch', target: img.id,
        message: `原件哈希与封存登记不符：登记 ${img.sha256.slice(0, 12)}…，当前 ${current.slice(0, 12)}…` });
    }
  }
  return findings;
}

export function reviewCorrections(archive) {
  const findings = [];
  const experts = new Set(archive.experts.map((e) => e.id));
  for (const fc of archive.fact_corrections) {
    if (!fc.source_ids?.length) {
      findings.push({ level: 'error', code: 'correction_without_source', target: fc.id,
        message: '事实更正没有附任何来源' });
    }
    const missingSources = fc.source_ids.filter((sid) => !archive.sources.some((s) => s.id === sid));
    if (missingSources.length) {
      findings.push({ level: 'error', code: 'correction_bad_source', target: fc.id,
        message: `更正引用了不存在的来源：${missingSources.join('、')}` });
    }
    if (fc.status === 'accepted') {
      if (!fc.signoffs?.length) {
        findings.push({ level: 'error', code: 'accepted_without_signoff', target: fc.id,
          message: '更正已生效但缺少专家签署，不得直接改定说法' });
      }
      for (const so of fc.signoffs ?? []) {
        if (!experts.has(so.expert_id)) {
          findings.push({ level: 'error', code: 'signoff_bad_expert', target: fc.id,
            message: `签署人 ${so.expert_id} 不在专家名册中` });
        }
      }
    }
    if (fc.previous === undefined || fc.previous === null) {
      findings.push({ level: 'warning', code: 'previous_missing', target: fc.id,
        message: '未记录被更正的原说法，审定链将无法回溯' });
    }
  }
  return findings;
}

export function reviewMerges(archive) {
  const findings = [];
  const imageIds = new Set(archive.images.map((i) => i.id));
  const personIds = new Set(archive.persons.map((p) => p.id));
  const mergedImages = new Map(archive.images.filter((i) => i.merged_into).map((i) => [i.id, i.merged_into]));

  for (const m of archive.merges) {
    if (!m.basis?.trim() || !m.source_ids?.length) {
      findings.push({ level: 'error', code: 'merge_without_basis', target: m.id,
        message: '归并必须写明依据并至少附一个来源' });
    }
    for (const sid of m.source_ids ?? []) {
      if (!archive.sources.some((s) => s.id === sid)) {
        findings.push({ level: 'error', code: 'merge_bad_source', target: m.id,
          message: `归并引用了不存在的来源：${sid}` });
      }
    }
    if (!m.members.includes(m.retained_id)) {
      findings.push({ level: 'error', code: 'retained_not_member', target: m.id,
        message: '保留项必须是归并成员之一' });
    }
    const pool = m.kind === 'duplicate_negative' ? imageIds : personIds;
    const kindLabel = m.kind === 'duplicate_negative' ? '影像' : '人物';
    for (const member of m.members) {
      if (!pool.has(member)) {
        findings.push({ level: 'error', code: 'merge_wrong_member_type', target: m.id,
          message: `${kindLabel}归并 ${m.id} 的成员 ${member} 不存在或类型不符` });
      }
    }
    // 归并不删除成员：成员记录必须仍在档，并各自带指向。
    if (m.kind === 'duplicate_negative') {
      for (const member of m.members) {
        if (member === m.retained_id) continue;
        if (mergedImages.get(member) !== m.retained_id) {
          findings.push({ level: 'warning', code: 'merge_pointer_missing', target: m.id,
            message: `重复底片 ${member} 未以 merged_into 指向保留件 ${m.retained_id}；归并只建指向、不删件` });
        }
      }
    }
  }
  return findings;
}

export function reviewCaptionChain(archive) {
  const findings = [];
  const byImage = new Map();
  for (const c of archive.captions) {
    if (!byImage.has(c.image_id)) byImage.set(c.image_id, []);
    byImage.get(c.image_id).push(c);
  }
  for (const img of archive.images) {
    const chain = (byImage.get(img.id) ?? []).sort((a, b) => a.version - b.version);
    if (!chain.length) {
      findings.push({ level: 'warning', code: 'caption_missing', target: img.id,
        message: '影像尚无任何审定文字' });
      continue;
    }
    const approved = chain.filter((c) => c.status === 'approved');
    if (approved.length > 1) {
      findings.push({ level: 'warning', code: 'multiple_approved_captions', target: img.id,
        message: `存在 ${approved.length} 条同时有效的审定文字，发布时无法确定版本` });
    }
    // 存疑信息随版本保留：任一版记录过争议，则现行版也必须带公众存疑说明。
    const everDisputed = chain.some((c) => c.uncertainty?.has_dispute);
    const current = approved[approved.length - 1];
    if (everDisputed && current && (!current.uncertainty?.has_dispute || !current.uncertainty.public_note)) {
      findings.push({ level: 'error', code: 'uncertainty_erased', target: img.id,
        message: '现行审定文字抹去了历史版本中记录的身份争议；发布不得抹平史料的不确定性' });
    }
  }
  return findings;
}

// 运行全部审定检查。checksums 为可选的封存系统当前原件哈希表（image_id -> sha256）。
export function runReview(archive, { checksums = {} } = {}) {
  const findings = [
    ...reviewOriginalIntegrity(archive, checksums),
    ...reviewCorrections(archive),
    ...reviewMerges(archive),
    ...reviewCaptionChain(archive),
  ];
  return {
    findings,
    errors: findings.filter((f) => f.level === 'error'),
    warnings: findings.filter((f) => f.level === 'warning'),
    ok: !findings.some((f) => f.level === 'error'),
  };
}

// 供后台“人物页”使用：把同人异名、归并关系、未决争议汇集到一个视图，不改动底档。
export function personView(archive, personId) {
  const person = archive.persons.find((p) => p.id === personId);
  if (!person) throw new Error(`人物不存在：${personId}`);
  const aliasMerges = archive.merges.filter(
    (m) => m.kind === 'same_person_alias' && m.members.includes(personId));
  const linkedIds = aliasMerges.flatMap((m) => m.members).filter((id) => id !== personId);
  return {
    ...person,
    merged_records: linkedIds.map((id) => archive.persons.find((p) => p.id === id)).filter(Boolean),
    open_disputes: (person.identity_disputes ?? []).filter((d) => d.status === 'unresolved'),
  };
}
