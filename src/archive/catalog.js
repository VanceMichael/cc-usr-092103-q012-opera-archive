import { ERR, fail } from './errors.js';
import { nextId, mustGet, put } from './store.js';

// 剧种：三十八个剧种各自登记源流与流行区域。
export function addGenre(store, { id, name, origin, region = '', note = '' }) {
  if (!name || !origin) fail(ERR.INVALID, '剧种须具备名称与源流说明');
  return put(store.genres, { id: id ?? nextId(store, 'genre'), name, origin, region, note }, '剧种');
}

// 剧目：挂在所属剧种下，可登记异名。
export function addPlay(store, { id, genreId, title, altTitles = [], synopsis = '' }) {
  mustGet(store.genres, genreId, '剧种');
  if (!title) fail(ERR.INVALID, '剧目须具备剧名');
  return put(store.plays, { id: id ?? nextId(store, 'play'), genreId, title, altTitles: [...altTitles], synopsis }, '剧目');
}

// 戏班：登记班社名称、所属剧种、活动年代与班址。
export function addTroupe(store, { id, name, genreId, baseLocationId = null, activeFrom = null, activeTo = null, note = '' }) {
  mustGet(store.genres, genreId, '剧种');
  if (baseLocationId) mustGet(store.locations, baseLocationId, '地点');
  if (!name) fail(ERR.INVALID, '戏班须具备名称');
  return put(store.troupes, { id: id ?? nextId(store, 'troupe'), name, genreId, baseLocationId, activeFrom, activeTo, note }, '戏班');
}

// 地点：县市、村落、戏台等，可逐级挂靠。
export function addLocation(store, { id, name, kind = 'place', parentId = null, note = '' }) {
  if (parentId) mustGet(store.locations, parentId, '地点');
  if (!name) fail(ERR.INVALID, '地点须具备名称');
  return put(store.locations, { id: id ?? nextId(store, 'loc'), name, kind, parentId, note }, '地点');
}

// 专家：按剧种（genre:g01）或领域（field:photo、field:all）登记专长，
// 事实更正、争议了结与归并都须由相应专家签署。
export function addExpert(store, { id, name, specialties = [], note = '' }) {
  if (!name) fail(ERR.INVALID, '专家须具备姓名');
  return put(store.experts, { id: id ?? nextId(store, 'exp'), name, specialties: [...specialties], note }, '专家');
}

// 艺人姓名类别：本名、艺名、俗称、误记、归并所得异名。
export const NAME_KINDS = Object.freeze(['birth', 'stage', 'nickname', 'misrecord', 'alias']);

// 艺人：一人多名是常态，每个名字都登记来源，误记也保留备查。
export function addArtist(store, { id, names, genreIds = [], troupeIds = [], birthYear = null, deathYear = null, bio = '', note = '' }) {
  if (!Array.isArray(names) || names.length === 0) fail(ERR.INVALID, '艺人须至少登记一个姓名');
  for (const g of genreIds) mustGet(store.genres, g, '剧种');
  for (const t of troupeIds) mustGet(store.troupes, t, '戏班');
  const artist = {
    id: id ?? nextId(store, 'artist'),
    names: names.map((n, i) => ({
      id: nextId(store, 'name'),
      value: n.value,
      kind: n.kind ?? (i === 0 ? 'birth' : 'alias'),
      source: n.source ?? '',
    })),
    genreIds: [...genreIds],
    troupeIds: [...troupeIds],
    birthYear,
    deathYear,
    bio,
    note,
    status: 'active',
    mergedInto: null,
  };
  for (const n of artist.names) {
    if (!n.value) fail(ERR.INVALID, '艺人姓名不能为空');
    if (!NAME_KINDS.includes(n.kind)) fail(ERR.INVALID, `未知姓名类别：${n.kind}`);
  }
  return put(store.artists, artist, '艺人');
}

// 拍摄批次：一次田野拍摄的若干底片同属一批，记录拍摄时间、摄影者与地点。
export function addBatch(store, { id, title, shotAt = null, photographer = '', locationId = null, genreIds = [], note = '' }) {
  if (!title) fail(ERR.INVALID, '拍摄批次须具备题名');
  if (locationId) mustGet(store.locations, locationId, '地点');
  for (const g of genreIds) mustGet(store.genres, g, '剧种');
  return put(store.batches, { id: id ?? nextId(store, 'batch'), title, shotAt, photographer, locationId, genreIds: [...genreIds], note }, '拍摄批次');
}
