// 验证标记队列 (localStorage) — 从 database.js 抽出
import * as S from './state.js';

const PENDING_VER_KEY = 'cht-verification-pending';

export function getPendingVerifications() {
  try {
    const raw = localStorage.getItem(PENDING_VER_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

export function savePendingVerification(type, id, note) {
  const pending = getPendingVerifications();
  const key = type + ':' + id;
  pending[key] = {
    method: 'human',
    confidence: 'absolute',
    verifiedBy: '七毛',
    verifiedAt: new Date().toISOString().slice(0, 10),
    note: note || '',
    appliesTo: 'database',
  };
  localStorage.setItem(PENDING_VER_KEY, JSON.stringify(pending));
}

export function savePendingErrorReport(type, id, note) {
  const pending = getPendingVerifications();
  const key = type + ':' + id;
  pending[key] = {
    method: 'error',
    confidence: 'absolute',
    verifiedBy: '七毛',
    verifiedAt: new Date().toISOString().slice(0, 10),
    note: note,
    appliesTo: 'database',
  };
  localStorage.setItem(PENDING_VER_KEY, JSON.stringify(pending));
}

export function getVerStatus(type, id) {
  const key = type + ':' + id;
  const pending = getPendingVerifications()[key];
  if (pending) return { method: pending.method, confidence: pending.confidence };
  const entry = S.VERIFICATION_BY_ID[key];
  if (!entry) return null;
  return { method: entry.method, confidence: entry.confidence };
}

export function exportIncremental(onDone) {
  const pending = getPendingVerifications();
  if (!Object.keys(pending).length) { alert('没有新增验证记录'); return; }
  const output = {
    _meta: {
      name: 'verification-map',
      version: '0.8.1',
      description: '人工验证增量',
    },
    items: pending,
  };
  downloadJSON(output, 'verification-incremental-' + ts());
  if (onDone) onDone();
}

export function exportFull(onDone) {
  const pending = getPendingVerifications();
  const items = {};
  if (S.VERIFICATION_RAW && S.VERIFICATION_RAW.items) {
    Object.assign(items, S.VERIFICATION_RAW.items);
  }
  for (const [key, entry] of Object.entries(pending)) {
    const exists = items[key];
    if (!exists || exists.method === 'ai' || entry.method === 'human' || entry.method === 'error') {
      items[key] = entry;
    }
  }
  const output = {
    _meta: S.VERIFICATION_RAW ? S.VERIFICATION_RAW._meta : {
      name: 'verification-map',
      version: '0.8.1',
      description: '人工/AI 校验结果',
      rules: {
        human: { method: 'human', confidence: 'absolute', note: '仅限用户本人标记。AI 不得标记为 human。' },
        ai: { method: 'ai', confidence: ['high', 'medium', 'low'], note: 'AI 校验不得使用 absolute。' },
      },
      keyFormat: '{type}:{id}',
      types: ['polity', 'ruler', 'era', 'event'],
    },
    items,
  };
  downloadJSON(output, 'verification-map-' + ts());
  setTimeout(() => { localStorage.removeItem(PENDING_VER_KEY); }, 30000);
  if (onDone) onDone();
}

export function clearPendingVerifications() {
  localStorage.removeItem(PENDING_VER_KEY);
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ts() {
  return new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
}
