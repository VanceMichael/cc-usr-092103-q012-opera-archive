// 发布层：展览、出版、研究下载、青少年传播四个渠道各自执行自己的授权范围。
// 发布清单（manifest）让每一张已发布影像都能指回：审定文字版本、许可版本、
// 归并关系与未决争议——争议说明随清单发布，不得抹平。

export const CHANNELS = ['exhibition', 'publication', 'research_download', 'youth'];

export const CHANNEL_LABELS = {
  exhibition: '展览',
  publication: '出版',
  research_download: '研究下载',
  youth: '青少年传播',
};

// 渠道对衍生副本的额外要求。
const CHANNEL_DERIVATIVE_RULES = {
  exhibition: () => null,
  publication: () => null,
  research_download: () => null,
  youth: (img, permissionVersion) =>
    permissionVersion.watermark_required && !img.derivatives.some((d) => d.file.includes('_wm'))
      ? '青少年传播渠道要求使用打水印副本，但该影像没有水印衍生件'
      : null,
};

function currentPermission(archive, permissionId) {
  const perm = archive.permissions.find((p) => p.id === permissionId);
  if (!perm) throw new Error(`许可不存在：${permissionId}`);
  const version = perm.versions.find((v) => v.version === perm.current_version);
  return { perm, version };
}

function approvedCaption(archive, imageId) {
  const chain = archive.captions
    .filter((c) => c.image_id === imageId && c.status === 'approved')
    .sort((a, b) => b.version - a.version);
  return chain[0] ?? null;
}

// 判断单幅影像能否进入某渠道；返回 { ok, reason }。
export function checkChannel(archive, imageId, channel) {
  if (!CHANNELS.includes(channel)) {
    return { ok: false, reason: `未知渠道：${channel}` };
  }
  const img = archive.images.find((i) => i.id === imageId);
  if (!img) return { ok: false, reason: `影像不存在：${imageId}` };

  // 重复底片的副本不直接发布，统一走保留件。
  if (img.merged_into) {
    return { ok: false, reason: `该影像已按归并记录指向 ${img.merged_into}，发布请使用保留件` };
  }

  const { version } = currentPermission(archive, img.permission_id);
  if (!version.scope[channel]) {
    return { ok: false, reason: `许可 ${img.permission_id} v${version.version} 未授权${CHANNEL_LABELS[channel]}渠道` };
  }

  const caption = approvedCaption(archive, imageId);
  if (!caption) {
    return { ok: false, reason: '缺少审定通过的说明文字，不得发布' };
  }

  const derivativeIssue = CHANNEL_DERIVATIVE_RULES[channel](img, version);
  if (derivativeIssue) return { ok: false, reason: derivativeIssue };

  return { ok: true, reason: null };
}

// 为某渠道生成发布清单。每一行都能指回审定文字与许可版本，并携带未决争议。
export function buildManifest(archive, channel, imageIds = null) {
  const targets = imageIds ?? archive.images.map((i) => i.id);
  const items = [];
  const blocked = [];

  for (const id of targets) {
    const check = checkChannel(archive, id, channel);
    const img = archive.images.find((i) => i.id === id);
    if (!check.ok) {
      blocked.push({ image_id: id, reason: check.reason });
      continue;
    }
    const { perm, version } = currentPermission(archive, img.permission_id);
    const caption = approvedCaption(archive, id);
    const merges = archive.merges.filter((m) => m.members.includes(id));
    const disputes = img.depicts.person_ids.flatMap((pid) => {
      const person = archive.persons.find((p) => p.id === pid);
      return (person?.identity_disputes ?? []).filter((d) => d.status === 'unresolved');
    });

    items.push({
      image_id: id,
      channel,
      file: pickFile(img, channel, version),
      original_file: img.original_file,
      sha256: img.sha256,
      caption: {
        id: caption.id,
        version: caption.version,
        text: caption.text,
        approved_by: caption.approved_by,
        approved_at: caption.approved_at,
      },
      permission: {
        id: perm.id,
        version: version.version,
        licensor: perm.licensor.name,
        restrictions: version.restrictions ?? [],
      },
      merges: merges.map((m) => ({ id: m.id, kind: m.kind, basis: m.basis })),
      // 不确定性随发布同行：未决争议与公众存疑说明必须出现在清单里。
      uncertainty: {
        has_dispute: caption.uncertainty.has_dispute || disputes.length > 0,
        dispute_ids: [...new Set([...caption.uncertainty.dispute_ids, ...disputes.map((d) => d.id)])],
        public_note: caption.uncertainty.public_note,
      },
    });
  }

  return { channel, channel_label: CHANNEL_LABELS[channel], generated_from: archive.sample_id, items, blocked };
}

function pickFile(img, channel, permissionVersion) {
  if (channel === 'youth' && permissionVersion.watermark_required) {
    const wm = img.derivatives.find((d) => d.file.includes('_wm'));
    return wm.file;
  }
  const web = img.derivatives.find((d) => !d.edited);
  return web ? web.file : img.original_file;
}

// 已发布影像的追溯视图：从清单行反查全部审定依据。
export function tracePublishedImage(archive, manifestItem) {
  const img = archive.images.find((i) => i.id === manifestItem.image_id);
  const caption = archive.captions.find((c) => c.id === manifestItem.caption.id);
  const corrections = archive.fact_corrections.filter((fc) =>
    fc.status === 'accepted' &&
    (fc.target.id === manifestItem.image_id ||
      img.depicts.person_ids.includes(fc.target.id)));
  return {
    image: img,
    caption,
    permission: archive.permissions.find((p) => p.id === manifestItem.permission.id),
    accepted_corrections: corrections,
    merges: archive.merges.filter((m) => m.members.includes(manifestItem.image_id)),
    audit_trail: archive.audit_events.filter((e) =>
      e.target === manifestItem.image_id ||
      e.target === manifestItem.permission.id ||
      corrections.some((fc) => fc.id === e.target)),
  };
}
