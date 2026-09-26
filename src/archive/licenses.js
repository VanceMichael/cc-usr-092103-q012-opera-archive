import { ERR, fail } from './errors.js';
import { nextId, mustGet, put } from './store.js';
import { now } from './util.js';

// 四个传播渠道：展览、出版、研究下载、青少年传播，各自执行自己的授权范围。
export const CHANNELS = Object.freeze(['exhibition', 'publication', 'research', 'youth']);
const SCOPE_VALUES = ['allow', 'conditional', 'deny'];

// 许可按版本登记：授权变化产生新版本，旧版本留档，
// 已发布的内容仍能追到发布时的许可版本。
export function grantLicense(store, { imageId, scopes, conditions = {}, grantedBy = null, note = '', at }) {
  mustGet(store.images, imageId, '影像');
  for (const channel of CHANNELS) {
    if (!SCOPE_VALUES.includes(scopes?.[channel])) {
      fail(ERR.INVALID, `许可须明确 ${channel} 渠道的授权范围（allow/conditional/deny）`);
    }
  }
  const version = licenseHistory(store, imageId).reduce((max, l) => Math.max(max, l.version), 0) + 1;
  for (const license of store.licenses.values()) {
    if (license.imageId === imageId && license.state === 'current') license.state = 'superseded';
  }
  const license = {
    id: nextId(store, 'lic'),
    imageId,
    version,
    scopes: Object.freeze({ ...scopes }),
    conditions: Object.freeze({ ...conditions }),
    grantedBy,
    note,
    state: 'current',
    grantedAt: at ?? now(),
  };
  return put(store.licenses, license, '许可');
}

export function currentLicense(store, imageId) {
  return [...store.licenses.values()].find(l => l.imageId === imageId && l.state === 'current') ?? null;
}

export function licenseHistory(store, imageId) {
  return [...store.licenses.values()].filter(l => l.imageId === imageId).sort((a, b) => a.version - b.version);
}

// 渠道判定：deny 拒绝；conditional 放行但须把条件写进发布记录。
export function licenseAllows(store, imageId, channel) {
  const license = currentLicense(store, imageId);
  if (!license) return { allowed: false, reason: 'no-license', license: null };
  const scope = license.scopes[channel];
  if (scope === 'allow') return { allowed: true, reason: 'allow', license };
  if (scope === 'conditional') {
    return { allowed: true, reason: 'conditional', conditions: license.conditions[channel] ?? '', license };
  }
  return { allowed: false, reason: 'deny', license };
}
