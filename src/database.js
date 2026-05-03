// 数据库侧栏（v0.8）：右侧面板展示政权/君主/年号/事件详情
import * as S from './state.js';
import { yl } from './data.js';
import { navigateTo } from './render.js';

// ===== A-8-1: 展示字段配置 =====
const FIELD_CONFIGS = {
  polity: [
    { key: 'name', label: '名称' },
    { key: 'selfName', label: '自称' },
    { key: 'aliases', label: '别名', format: v => Array.isArray(v) ? v.join('、') : v },
    { key: 'period', label: '时期' },
    { key: 'isCentral', label: '类型', format: v => v ? '中央王朝' : null },
    { key: 'isBorder', label: '边疆政权', format: v => v ? '是' : null },
    { key: 'startYear', label: '起始年', format: v => yl(v) },
    { key: 'endYear', label: '终止年', format: v => yl(v) },
  ],
  ruler: [
    { key: 'displayTitle', label: '称号' },
    { key: 'personalName', label: '姓名' },
    { key: 'templeTitle', label: '庙号' },
    { key: 'posthumousTitle', label: '谥号' },
    { key: 'aliases', label: '别名', format: v => Array.isArray(v) ? v.join('、') : v },
    { key: 'polityId', label: '所属政权', format: v => (S.IDX.polityById[v] || {}).name || v },
    { key: 'reignStartYear', label: '起始年', format: v => yl(v) },
    { key: 'reignEndYear', label: '终止年', format: v => yl(v) },
  ],
  era: [
    { key: 'name', label: '年号' },
    { key: 'aliases', label: '别名', format: v => Array.isArray(v) ? v.join('、') : v },
    { key: 'polityId', label: '所属政权', format: v => (S.IDX.polityById[v] || {}).name || v },
    { key: 'startYear', label: '起始年', format: v => yl(v) },
    { key: 'endYear', label: '终止年', format: v => yl(v) },
  ],
  event: [
    { key: 'title', label: '标题' },
    { key: 'text', label: '简述' },
    { key: 'year', label: '年份', format: v => yl(v) },
    { key: 'level', label: '级别' },
    { key: 'type', label: '类型' },
    { key: 'relatedPolities', label: '关联政权', format: v => Array.isArray(v) ? v.map(pid => (S.IDX.polityById[pid] || {}).name || pid).join('、') : v },
    { key: 'description', label: '详细描述' },
  ],
};

const FALLBACK_TEXT = '未补充';

function formatField(entity, cfg) {
  const val = entity[cfg.key];
  if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) return FALLBACK_TEXT;
  if (cfg.format) {
    const formatted = cfg.format(val);
    if (formatted == null || formatted === '') return FALLBACK_TEXT;
    return formatted;
  }
  return String(val);
}

// ===== 验证标记队列 (localStorage) =====
const PENDING_VER_KEY = 'cht-verification-pending';

function getPendingVerifications() {
  try {
    const raw = localStorage.getItem(PENDING_VER_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function savePendingVerification(type, id, note) {
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
  renderPanel();
}

function getVerStatus(type, id) {
  const key = type + ':' + id;
  if (getPendingVerifications()[key]) return { method: 'human', confidence: 'absolute' };
  const entry = S.VERIFICATION_BY_ID[key];
  if (!entry) return null;
  return { method: entry.method, confidence: entry.confidence };
}

function exportVerifications() {
  const pending = getPendingVerifications();
  if (!Object.keys(pending).length) return;

  const items = {};
  // 合并原始数据
  if (S.VERIFICATION_RAW && S.VERIFICATION_RAW.items) {
    Object.assign(items, S.VERIFICATION_RAW.items);
  }
  // 合并 pending
  for (const [key, entry] of Object.entries(pending)) {
    const exists = items[key];
    // pending 覆盖原条目（包括 AI 校验可升级为 human）
    if (!exists || exists.method !== 'human' || entry.method === 'human') {
      items[key] = entry;
    }
  }

  const output = {
    _meta: S.VERIFICATION_RAW ? S.VERIFICATION_RAW._meta : {
      name: "verification-map",
      version: "0.8.0",
      description: "人工/AI 校验结果",
      rules: {
        human: { method: "human", confidence: "absolute", note: "仅限用户本人标记。AI 不得标记为 human。" },
        ai: { method: "ai", confidence: ["high", "medium", "low"], note: "AI 校验不得使用 absolute。" },
      },
      keyFormat: "{type}:{id}",
      types: ["polity", "ruler", "era", "event"],
    },
    items,
  };

  const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
  a.download = 'verification-map-' + ts + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  localStorage.removeItem(PENDING_VER_KEY);
  renderPanel();
}

// ===== 筛选状态 =====
const DB_PERIODS = ['先秦', '秦汉', '魏晋南北朝', '隋唐五代', '宋辽金', '元明清'];
let dbFilters = { period: null, central: false, border: false };

// ===== 面板状态 =====
let currentTab = 'polity';
let filterText = '';
let selectedDetail = null;  // { type, entity }
let preFilter = null;       // 预筛选 { polityId }

// ===== 公开 API =====
export function openDatabase() {
  currentTab = 'polity';
  filterText = '';
  selectedDetail = null;
  preFilter = null;
  dbFilters = { period: null, central: false, border: false };
  document.getElementById('databasePanel').classList.add('open');
  document.body.classList.add('db-open');
  document.getElementById('dbFilter').focus();
  renderPanel();
}

export function closeDatabase() {
  document.getElementById('databasePanel').classList.remove('open');
  document.body.classList.remove('db-open');
  selectedDetail = null;
}

// ===== 渲染入口 =====
function renderPanel() {
  const body = document.getElementById('dbBody');
  body.textContent = '';

  // 更新 header：导出按钮
  const pending = getPendingVerifications();
  const pCount = Object.keys(pending).length;
  const header = document.getElementById('databasePanel').querySelector('.db-header');
  let exportBtn = header.querySelector('.db-export-btn');
  if (pCount > 0) {
    if (!exportBtn) {
      exportBtn = document.createElement('button');
      exportBtn.className = 'db-export-btn';
      exportBtn.textContent = '导出验证 (' + pCount + ')';
      exportBtn.addEventListener('click', exportVerifications);
      header.insertBefore(exportBtn, header.querySelector('.db-close'));
    } else {
      exportBtn.textContent = '导出验证 (' + pCount + ')';
    }
  } else if (exportBtn) {
    exportBtn.remove();
  }

  renderDbFilterTags();

  if (selectedDetail) {
    renderDetail(body, selectedDetail.type, selectedDetail.entity);
    return;
  }

  const list = getFilteredList();
  renderList(body, list);
}

function renderDbFilterTags() {
  const el = document.getElementById('dbFilterTags');
  el.textContent = '';
  if (selectedDetail || currentTab === 'event') return;

  function makeTag(label, key, val) {
    const sp = document.createElement('span');
    sp.className = 'col-tag' + (dbFilters[key] === val ? ' active' : '');
    sp.textContent = label;
    sp.addEventListener('click', () => {
      if (key === 'period') dbFilters.period = dbFilters.period === val ? null : val;
      else if (key === 'central') { dbFilters.central = !dbFilters.central; dbFilters.border = false; }
      else if (key === 'border') { dbFilters.border = !dbFilters.border; dbFilters.central = false; }
      renderPanel();
    });
    return sp;
  }

  DB_PERIODS.forEach(p => el.appendChild(makeTag(p, 'period', p)));
  if (currentTab === 'polity') {
    el.appendChild(makeTag('中央', 'central', true));
    el.appendChild(makeTag('边疆', 'border', true));
  }
  el.appendChild(makeTag('全部', 'period', null));
}

// ===== 列表数据获取 =====
function getFilteredList() {
  const q = filterText.trim().toLowerCase();
  switch (currentTab) {
    case 'polity': {
      let items = S.POLITIES;
      if (q) items = items.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.selfName || '').toLowerCase().includes(q) ||
        (p.aliases || []).some(a => a.toLowerCase().includes(q))
      );
      if (dbFilters.period) items = items.filter(p => p.period === dbFilters.period);
      if (dbFilters.central) items = items.filter(p => p.isCentral);
      if (dbFilters.border) items = items.filter(p => p.isBorder);
      return items.map(p => ({
        id: p.id,
        label: p.name,
        hint: (p.startYear < 0 ? '前' + (-p.startYear) : p.startYear) + '~' + (p.endYear < 0 ? '前' + (-p.endYear) : p.endYear),
        tag: '政权',
        tagClass: 'polity',
        entity: p,
      }));
    }
    case 'ruler': {
      let items = S.SEARCH_RULERS;
      if (preFilter && preFilter.polityId) items = items.filter(r => r.polityId === preFilter.polityId);
      if (dbFilters.period) items = items.filter(r => (S.IDX.polityById[r.polityId] || {}).period === dbFilters.period);
      if (q) items = items.filter(r =>
        (r.displayTitle || '').toLowerCase().includes(q) ||
        (r.personalName || '').toLowerCase().includes(q) ||
        (r.templeTitle || '').toLowerCase().includes(q) ||
        (r.posthumousTitle || '').toLowerCase().includes(q) ||
        ((S.IDX.polityById[r.polityId] || {}).name || '').toLowerCase().includes(q) ||
        (r.aliases || []).some(a => a.toLowerCase().includes(q))
      );
      return items.map(r => {
        const pn = (S.IDX.polityById[r.polityId] || {}).name || '';
        return {
          id: r.id,
          label: r.displayTitle || r.personalName || '?',
          hint: pn ? pn + ' · ' + yl(r.reignStartYear) + '~' + yl(r.reignEndYear) : yl(r.reignStartYear) + '~' + yl(r.reignEndYear),
          tag: '君主',
          tagClass: 'ruler',
          entity: r,
        };
      });
    }
    case 'era': {
      let items = S.ERAS;
      if (preFilter && preFilter.polityId) items = items.filter(e => e.polityId === preFilter.polityId);
      if (dbFilters.period) items = items.filter(e => (S.IDX.polityById[e.polityId] || {}).period === dbFilters.period);
      if (q) items = items.filter(e =>
        e.name.toLowerCase().includes(q) ||
        (e.aliases || []).some(a => a.toLowerCase().includes(q)) ||
        ((S.IDX.polityById[e.polityId] || {}).name || '').toLowerCase().includes(q)
      );
      return items.map(e => {
        const pn = (S.IDX.polityById[e.polityId] || {}).name || '';
        return {
          id: e.id,
          label: e.name,
          hint: pn ? pn + ' · ' + yl(e.startYear) + '~' + yl(e.endYear) : yl(e.startYear) + '~' + yl(e.endYear),
          tag: '年号',
          tagClass: 'era',
          entity: e,
        };
      });
    }
    case 'event': {
      let items = S.EVENTS;
      if (q) items = items.filter(ev =>
        (ev.title || '').toLowerCase().includes(q) ||
        (ev.text || '').toLowerCase().includes(q) ||
        (ev.type || '').toLowerCase().includes(q) ||
        (ev.relatedPolities || []).some(pid => {
          const pn = (S.IDX.polityById[pid] || {}).name;
          return pn && pn.toLowerCase().includes(q);
        })
      );
      return items.map(ev => ({
        id: ev.id,
        label: ev.title || ev.text || '?',
        hint: yl(ev.year) + (ev.type ? ' · ' + ev.type : ''),
        tag: '事件',
        tagClass: 'event',
        entity: ev,
      }));
    }
    default:
      return [];
  }
}

// ===== 列表渲染 =====
function renderList(body, items) {
  // 统计
  const info = document.createElement('div');
  info.style.cssText = 'font-size:.6rem;color:#8b6e4e;margin-bottom:3px;padding:0 6px';
  info.textContent = items.length + ' 条';
  body.appendChild(info);

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'db-item';
    row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 6px;border-bottom:1px solid #e8dcc8;cursor:pointer;font-size:.68rem';
    row.addEventListener('mouseenter', () => { row.style.background = '#f0e8d8'; });
    row.addEventListener('mouseleave', () => { row.style.background = ''; });
    row.addEventListener('click', () => {
      selectedDetail = { type: currentTab, entity: item.entity };
      renderPanel();
    });

    const tag = document.createElement('span');
    tag.className = 'tag ' + item.tagClass;
    tag.textContent = item.tag;
    row.appendChild(tag);

    const label = document.createElement('span');
    label.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    label.textContent = item.label;
    row.appendChild(label);

    const hint = document.createElement('span');
    hint.style.cssText = 'font-size:.6rem;color:#aaa;flex-shrink:0';
    hint.textContent = item.hint;
    row.appendChild(hint);

    body.appendChild(row);
  }
}

// ===== 详情渲染 =====
function renderDetail(body, type, entity) {
  const configs = FIELD_CONFIGS[type];
  if (!configs) return;

  // 返回按钮
  const backBtn = document.createElement('div');
  backBtn.style.cssText = 'font-size:.62rem;color:#1D4C50;cursor:pointer;padding:4px 6px;margin-bottom:2px';
  backBtn.textContent = '← 返回列表';
  backBtn.addEventListener('click', () => { selectedDetail = null; renderPanel(); });
  body.appendChild(backBtn);

  // 标题栏
  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;gap:4px;padding:2px 6px 6px;border-bottom:1px solid #e8dcc8;margin-bottom:6px';
  const tag = document.createElement('span');
  tag.className = 'tag ' + type;
  const TAG_LABELS = { polity: '政权', ruler: '君主', era: '年号', event: '事件' };
  tag.textContent = TAG_LABELS[type] || type;
  titleRow.appendChild(tag);
  const title = document.createElement('span');
  title.style.cssText = 'font-weight:700;font-size:.75rem';
  title.textContent = entity.displayTitle || entity.name || entity.title || entity.personalName || entity.id;
  titleRow.appendChild(title);
  // review 状态
  const ver = getVerStatus(type, entity.id);
  if (ver) {
    const rs = document.createElement('span');
    rs.style.cssText = 'font-size:.6rem;color:#888;margin-left:auto';
    if (ver.method === 'human') {
      rs.textContent = '✅人工校验';
    } else {
      const confMap = { high: '高', medium: '中', low: '低' };
      rs.textContent = '🤖AI校验（可靠度' + (confMap[ver.confidence] || ver.confidence) + '）';
    }
    titleRow.appendChild(rs);
  }
  body.appendChild(titleRow);

  // 字段列表
  for (const cfg of configs) {
    const val = formatField(entity, cfg);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;padding:2px 6px;font-size:.68rem;line-height:1.6';

    const label = document.createElement('span');
    label.style.cssText = 'color:#888;width:72px;flex-shrink:0';
    label.textContent = cfg.label;
    row.appendChild(label);

    const value = document.createElement('span');
    value.style.cssText = 'flex:1;color:' + (val === FALLBACK_TEXT ? '#ccc' : 'var(--text)');
    value.textContent = val;
    row.appendChild(value);

    // 政权名称可点击跳转
    if (cfg.key === 'polityId' && entity.polityId && S.IDX.polityById[entity.polityId]) {
      value.style.cursor = 'pointer';
      value.style.color = 'var(--panel-border)';
      value.title = '点击查看政权详情';
      value.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedDetail = { type: 'polity', entity: S.IDX.polityById[entity.polityId] };
        renderPanel();
      });
    }

    body.appendChild(row);
  }

  // 分隔
  const sep = document.createElement('div');
  sep.style.cssText = 'border-top:1px solid #e8dcc8;margin:6px 6px 4px';
  body.appendChild(sep);

  // 跳转按钮
  const jumpBtn = document.createElement('button');
  jumpBtn.style.cssText = 'display:block;width:calc(100% - 12px);margin:4px 6px;padding:4px 0;border:1px solid var(--panel-border);border-radius:4px;background:transparent;color:var(--panel-border);cursor:pointer;font-size:.7rem;text-align:center';
  jumpBtn.textContent = '跳转到年表';
  jumpBtn.addEventListener('click', () => {
    const dest = getNavigateDest(type, entity);
    if (dest) {
      closeDatabase();
      navigateTo(dest);
    }
  });
  body.appendChild(jumpBtn);

  // 关联实体跳转
  if (type === 'polity') {
    const rulerLink = document.createElement('button');
    rulerLink.style.cssText = 'display:block;width:calc(100% - 12px);margin:2px 6px;padding:4px 0;border:1px solid var(--panel-border);border-radius:4px;background:transparent;color:var(--panel-border);cursor:pointer;font-size:.65rem;text-align:center';
    rulerLink.textContent = '→ 显示该政权所有君主';
    rulerLink.addEventListener('click', () => {
      currentTab = 'ruler';
      filterText = '';
      selectedDetail = null;
      preFilter = { polityId: entity.id };
      dbFilters = { period: null, central: false, border: false };
      document.getElementById('dbFilter').value = '';
      renderPanel();
      updateTabUI();
    });
    body.appendChild(rulerLink);
  }
  if (type === 'ruler' && entity.polityId) {
    const eraLink = document.createElement('button');
    eraLink.style.cssText = 'display:block;width:calc(100% - 12px);margin:2px 6px;padding:4px 0;border:1px solid var(--panel-border);border-radius:4px;background:transparent;color:var(--panel-border);cursor:pointer;font-size:.65rem;text-align:center';
    eraLink.textContent = '→ 显示该君主所有年号';
    eraLink.addEventListener('click', () => {
      currentTab = 'era';
      filterText = '';
      selectedDetail = null;
      preFilter = { polityId: entity.polityId };
      dbFilters = { period: null, central: false, border: false };
      document.getElementById('dbFilter').value = '';
      renderPanel();
      updateTabUI();
    });
    body.appendChild(eraLink);
  }

  // 标记已验证按钮（灰色，仅对未标记 human 的条目显示）
  const alreadyMarked = (ver && ver.method === 'human') || getPendingVerifications()[type + ':' + entity.id];
  if (!alreadyMarked) {
    const markBtn = document.createElement('button');
    markBtn.style.cssText = 'display:block;width:calc(100% - 12px);margin:2px 6px 4px;padding:4px 0;border:1px solid #ccc;border-radius:4px;background:transparent;color:#aaa;cursor:pointer;font-size:.7rem;text-align:center';
    markBtn.textContent = '标记已验证';
    markBtn.addEventListener('click', () => {
      // 内联 note 输入
      markBtn.style.display = 'none';
      const form = document.createElement('div');
      form.style.cssText = 'margin:2px 6px 4px';
      const textarea = document.createElement('textarea');
      textarea.placeholder = '校验备注（可选）';
      textarea.style.cssText = 'width:100%;padding:3px 5px;border:1px solid var(--border);border-radius:3px;font-size:.65rem;font-family:inherit;resize:none;height:40px';
      form.appendChild(textarea);
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:4px;margin-top:3px';
      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = '确认';
      confirmBtn.style.cssText = 'flex:1;padding:3px 0;border:1px solid #2d5a4e;border-radius:3px;background:#2d5a4e;color:#fff;cursor:pointer;font-size:.65rem';
      confirmBtn.addEventListener('click', () => {
        savePendingVerification(type, entity.id, textarea.value.trim());
      });
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = '取消';
      cancelBtn.style.cssText = 'flex:1;padding:3px 0;border:1px solid var(--border);border-radius:3px;background:transparent;color:#888;cursor:pointer;font-size:.65rem';
      cancelBtn.addEventListener('click', () => {
        form.remove();
        markBtn.style.display = 'block';
      });
      btnRow.appendChild(confirmBtn);
      btnRow.appendChild(cancelBtn);
      form.appendChild(btnRow);
      body.insertBefore(form, body.lastChild);
      textarea.focus();
    });
    body.appendChild(markBtn);
  }
}

function getNavigateDest(type, entity) {
  switch (type) {
    case 'polity': return { year: entity.startYear, polityId: entity.id, highlight: { pid: entity.id, sy: entity.startYear, ey: entity.endYear } };
    case 'ruler': return { year: entity.reignStartYear, polityId: entity.polityId, rulerId: entity.id, highlight: { pid: entity.polityId, sy: entity.reignStartYear, ey: entity.reignEndYear } };
    case 'era': return { year: entity.startYear, polityId: entity.polityId, eraId: entity.id };
    case 'event': return { year: entity.year, highlight: null };
    default: return null;
  }
}

// ===== Tab 切换 =====
export function switchTab(tab) {
  currentTab = tab;
  filterText = '';
  selectedDetail = null;
  preFilter = null;
  dbFilters = { period: null, central: false, border: false };
  document.getElementById('dbFilter').value = '';
  renderPanel();
  updateTabUI();
}

function updateTabUI() {
  document.querySelectorAll('.db-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === currentTab);
  });
}

// ===== 过滤 =====
export function setFilter(v) {
  filterText = v;
  selectedDetail = null;
  preFilter = null;
  dbFilters = { period: null, central: false, border: false };
  renderPanel();
}
