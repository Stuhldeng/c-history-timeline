// 数据库侧栏（v0.8）：右侧面板展示政权/君主/年号/事件详情
import * as S from './state.js';
import { yl } from './data.js';
import { navigateTo, refresh } from './render.js';
import { calibrateRowHeight } from './virtual-scroll.js';
import { getPendingVerifications, savePendingVerification, savePendingErrorReport, getVerStatus, exportIncremental, exportFull, clearPendingVerifications } from './verification.js';

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

// ===== 筛选状态 =====
const DB_PERIODS = ['先秦', '秦汉', '魏晋南北朝', '隋唐五代', '宋辽金', '元明清'];
let dbFilters = { period: null, central: false, border: false };

// ===== 面板状态 =====
let currentTab = 'polity';
let filterText = '';
let selectedDetail = null;  // { type, entity }
let preFilter = null;       // 预筛选 { polityId }
let backStack = [];         // [{ tab, entity: {type,id}, preFilter, filterText, dbFilters }]
const MAX_BACKSTACK = 5;

const DB_TABS = ['polity', 'ruler', 'era', 'event'];
let tabStates = {};
for (const t of DB_TABS) tabStates[t] = { filterText: '', dbFilters: { period: null, central: false, border: false }, preFilter: null };

function saveTabState() {
  tabStates[currentTab] = { filterText, dbFilters: { ...dbFilters }, preFilter: preFilter ? { ...preFilter } : null };
}
function loadTabState(tab) {
  const s = tabStates[tab] || { filterText: '', dbFilters: { period: null, central: false, border: false }, preFilter: null };
  filterText = s.filterText;
  dbFilters = { ...s.dbFilters };
  preFilter = s.preFilter ? { ...s.preFilter } : null;
}

// ===== 公开 API =====
export function openDatabase(options) {
  if (options) {
    saveTabState();
    if (options.tab) currentTab = options.tab;
    if (options.selectedDetail) selectedDetail = options.selectedDetail;
    loadTabState(currentTab);
  } else {
    loadTabState(currentTab);
  }
  document.getElementById('databasePanel').classList.add('open');
  document.body.classList.add('db-open');
  document.getElementById('dbFilter').value = filterText;
  document.getElementById('dbFilter').focus();
  backStack = [];
  renderPanel();
  calibrateRowHeight();
  refresh();
}

export function closeDatabase() {
  saveTabState();
  document.getElementById('databasePanel').classList.remove('open');
  document.body.classList.remove('db-open');
  calibrateRowHeight();
  refresh();
}

// ===== 渲染入口 =====
function renderPanel() {
  const body = document.getElementById('dbBody');
  body.textContent = '';

  // header：三个验证按钮（仅首次渲染时创建）
  const header = document.getElementById('databasePanel').querySelector('.db-header');
  if (!header.querySelector('.db-export-btn[data-act="inc"]')) {
    const btns = [
      { label: '导出新增', act: 'inc', cb: () => exportIncremental(() => renderPanel()) },
      { label: '导出完整', act: 'full', cb: () => exportFull(() => renderPanel()) },
      { label: '清除验证缓存', act: 'clear', cb: () => { clearPendingVerifications(); renderPanel(); }, style: 'border-color:#c0392b;color:#c0392b' },
    ];
    for (const b of btns) {
      const btn = document.createElement('button');
      btn.className = 'db-export-btn';
      btn.dataset.act = b.act;
      btn.textContent = b.label;
      if (b.style) btn.style.cssText = b.style;
      btn.addEventListener('click', b.cb);
      header.insertBefore(btn, header.querySelector('.db-close'));
    }
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

  if (preFilter && preFilter.polityId) {
    const pn = (S.IDX.polityById[preFilter.polityId] || {}).name || preFilter.polityId;
    const pfTag = document.createElement('span');
    pfTag.className = 'col-tag active';
    pfTag.textContent = '仅: ' + pn;
    pfTag.addEventListener('click', () => {
      preFilter = null;
      saveTabState();
      renderPanel();
    });
    el.appendChild(pfTag);
  }

  function makeTag(label, key, val) {
    const sp = document.createElement('span');
    sp.className = 'col-tag' + (dbFilters[key] === val ? ' active' : '');
    sp.textContent = label;
    sp.addEventListener('click', () => {
      if (key === 'period' && val === null) {
        dbFilters = { period: null, central: false, border: false };
        preFilter = null;
      } else if (key === 'period') dbFilters.period = dbFilters.period === val ? null : val;
      else if (key === 'central') { dbFilters.central = !dbFilters.central; dbFilters.border = false; }
      else if (key === 'border') { dbFilters.border = !dbFilters.border; dbFilters.central = false; }
      saveTabState();
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
      let items = (preFilter && preFilter.polityId) ? S.RULERS : S.SEARCH_RULERS;
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
      if (preFilter && preFilter.rulerReign) {
        const { start, end } = preFilter.rulerReign;
        items = items.filter(e => e.startYear >= start && e.startYear <= end);
      }
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
      backStack.push({ tab: currentTab, entity: null, preFilter, filterText, dbFilters: { ...dbFilters } });
      if (backStack.length > MAX_BACKSTACK) backStack.shift();
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
  backBtn.addEventListener('click', () => {
    if (backStack.length > 0) {
      const prev = backStack.pop();
      currentTab = prev.tab;
      preFilter = prev.preFilter || null;
      filterText = prev.filterText || '';
      dbFilters = prev.dbFilters || { period: null, central: false, border: false };
      document.getElementById('dbFilter').value = filterText;
      if (prev.entity) {
        const emap = { polity: 'polityById', ruler: 'rulerById', era: 'eraById', event: 'eventById' };
        const entity = S.IDX[emap[prev.entity.type]]?.[prev.entity.id];
        selectedDetail = entity ? { type: prev.entity.type, entity } : null;
      } else {
        selectedDetail = null;
      }
    } else {
      selectedDetail = null;
    }
    renderPanel();
    updateTabUI();
  });
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
    } else if (ver.method === 'error') {
      rs.textContent = '⚠️有错误报告';
      rs.style.color = '#c0392b';
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
  jumpBtn.className = 'db-action-btn';
  jumpBtn.textContent = '跳转到年表';
  jumpBtn.addEventListener('click', () => {
    const dest = getNavigateDest(type, entity);
    if (dest) {
      navigateTo(dest);
    }
  });
  body.appendChild(jumpBtn);

  // 关联实体跳转
  if (type === 'polity') {
    const rulerLink = document.createElement('button');
    rulerLink.className = 'db-action-btn-sm';
    rulerLink.textContent = '→ 显示该政权所有君主';
    rulerLink.addEventListener('click', () => {
      backStack.push({ tab: currentTab, entity: { type: currentTab, id: selectedDetail.entity.id }, preFilter, filterText, dbFilters: { ...dbFilters } });
      if (backStack.length > MAX_BACKSTACK) backStack.shift();
      saveTabState();
      currentTab = 'ruler';
      filterText = '';
      selectedDetail = null;
      preFilter = { polityId: entity.id };
      dbFilters = { period: null, central: false, border: false };
      saveTabState();
      document.getElementById('dbFilter').value = '';
      renderPanel();
      updateTabUI();
    });
    body.appendChild(rulerLink);
  }
  if (type === 'ruler' && entity.polityId) {
    const eraLink = document.createElement('button');
    eraLink.className = 'db-action-btn-sm';
    eraLink.textContent = '→ 显示该君主所有年号';
    eraLink.addEventListener('click', () => {
      backStack.push({ tab: currentTab, entity: { type: currentTab, id: selectedDetail.entity.id }, preFilter, filterText, dbFilters: { ...dbFilters } });
      if (backStack.length > MAX_BACKSTACK) backStack.shift();
      saveTabState();
      currentTab = 'era';
      filterText = '';
      selectedDetail = null;
      preFilter = { polityId: entity.polityId, rulerReign: { start: entity.reignStartYear, end: entity.reignEndYear } };
      dbFilters = { period: null, central: false, border: false };
      saveTabState();
      document.getElementById('dbFilter').value = '';
      renderPanel();
      updateTabUI();
    });
    body.appendChild(eraLink);
  }
  if (type === 'era' && entity.polityId) {
    const rulerBtn = document.createElement('button');
    rulerBtn.className = 'db-action-btn-sm';
    rulerBtn.textContent = '→ 显示该年号所属君主';
    rulerBtn.addEventListener('click', () => {
      const ruler = S.SEARCH_RULERS.find(r =>
        r.polityId === entity.polityId && r.reignStartYear <= entity.startYear && r.reignEndYear >= entity.startYear
      );
      if (ruler) {
        backStack.push({ tab: currentTab, entity: { type: currentTab, id: selectedDetail.entity.id }, preFilter, filterText, dbFilters: { ...dbFilters } });
        if (backStack.length > MAX_BACKSTACK) backStack.shift();
        selectedDetail = { type: 'ruler', entity: ruler };
        renderPanel();
      } else {
        alert('未找到对应君主');
      }
    });
    body.appendChild(rulerBtn);
  }

  const pending = getPendingVerifications();
  const alreadyMarked = (ver && (ver.method === 'human' || ver.method === 'error')) || pending[type + ':' + entity.id];
  if (!alreadyMarked) {
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:4px;margin:2px 6px 4px';

    const markBtn = document.createElement('button');
    markBtn.style.cssText = 'flex:2;padding:4px 0;border:1px solid #ccc;border-radius:4px;background:transparent;color:#aaa;cursor:pointer;font-size:.7rem;text-align:center';
    markBtn.textContent = '标记已验证';

    const errorBtn = document.createElement('button');
    errorBtn.style.cssText = 'flex:1;padding:4px 0;border:1px solid #c09090;border-radius:4px;background:transparent;color:#c09090;cursor:pointer;font-size:.7rem;text-align:center';
    errorBtn.textContent = '问题报告';

    btnRow.appendChild(markBtn);
    btnRow.appendChild(errorBtn);

    const showForm = (isError) => {
      btnRow.style.display = 'none';
      const form = document.createElement('div');
      form.style.cssText = 'margin:2px 6px 4px';
      const textarea = document.createElement('textarea');
      textarea.placeholder = isError ? '请描述错误内容（必填）' : '校验备注（可选）';
      textarea.style.cssText = 'width:100%;padding:3px 5px;border:1px solid var(--border);border-radius:3px;font-size:.65rem;font-family:inherit;resize:none;height:40px';
      form.appendChild(textarea);
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:.6rem;color:#c0392b;margin-top:2px;display:none';
      hint.textContent = '请填写错误描述后再提交';
      form.appendChild(hint);
      const formBtnRow = document.createElement('div');
      formBtnRow.style.cssText = 'display:flex;gap:4px;margin-top:3px';
      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = '确认';
      confirmBtn.style.cssText = 'flex:1;padding:3px 0;border:1px solid #2d5a4e;border-radius:3px;background:#2d5a4e;color:#fff;cursor:pointer;font-size:.65rem';
      confirmBtn.addEventListener('click', () => {
        const note = textarea.value.trim();
        if (isError && !note) {
          hint.style.display = 'block';
          textarea.style.borderColor = '#c0392b';
          return;
        }
        if (isError) savePendingErrorReport(type, entity.id, note);
        else savePendingVerification(type, entity.id, note);
        renderPanel();
      });
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = '取消';
      cancelBtn.style.cssText = 'flex:1;padding:3px 0;border:1px solid var(--border);border-radius:3px;background:transparent;color:#888;cursor:pointer;font-size:.65rem';
      cancelBtn.addEventListener('click', () => {
        form.remove();
        btnRow.style.display = 'flex';
      });
      formBtnRow.appendChild(confirmBtn);
      formBtnRow.appendChild(cancelBtn);
      form.appendChild(formBtnRow);
      body.insertBefore(form, body.lastChild);
      textarea.focus();
    };

    markBtn.addEventListener('click', () => showForm(false));
    errorBtn.addEventListener('click', () => showForm(true));

    body.appendChild(btnRow);
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
  saveTabState();
  backStack = [];
  currentTab = tab;
  loadTabState(tab);
  selectedDetail = null;
  document.getElementById('dbFilter').value = filterText;
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
  backStack = [];
  selectedDetail = null;
  saveTabState();
  renderPanel();
}
