// 审定后台入口：领域服务按模块导出，调用方持有 store 即可组装自己的后台。
export { DomainError, ERR } from './errors.js';
export { createStore, nextId, mustGet } from './store.js';
export * from './catalog.js';
export * from './images.js';
export * from './captions.js';
export * from './experts.js';
export * from './corrections.js';
export * from './disputes.js';
export * from './merges.js';
export * from './licenses.js';
export * from './publishing.js';
export * from './trace.js';
export { loadFixture } from './loader.js';
