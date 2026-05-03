import * as S from './state.js';
import { yl, ylYear, y2p } from './data.js';
import { applyColumnState, tempShowColumn, clearTempVisible, COLUMN_STATE, resetColumns, hideColumn, showColumn, pinColumn, unpinColumn } from './column.js';
import { calibrateRowHeight, getScrollTopForYear, updateVisibleRange, getVisibleYears, getTopSpacerHeight, getBottomSpacerHeight, getYearFromScroll } from './virtual-scroll.js';

// ===== 统一导航 =====
export function navigateTo({ year, polityId, rulerId, eraId, eventId, highlight } = {}) {
  if (year != null) S.setBaseYear(year);
  S.setLocked(true);
  S.setSearchHighlight(highlight || null);
  document.getElementById('lockToggle').checked = true;
  // 若目标政权所在列被隐藏，临时显示
  if (polityId) {
    const p = S.IDX.polityById[polityId];
    if (p) tempShowColumn('col-' + p.mergeGroup);
  }
  renderAll();
  if (S.BASE_YEAR != null) scrollToYear(S.BASE_YEAR);
  updateTimeline();
  updateStatus();
  clearTempVisible();
}

// ===== 合并组（前端动态计算） =====
export function getMergeGroups() {
  const start = S.BASE_YEAR - S.N_VAL, end = S.BASE_YEAR + S.N_VAL;
  const inRange = new Set();
  for (const p of S.POLITIES) {
    if (p.endYear >= start && p.startYear <= end) inRange.add(p.mergeGroup);
  }
  const g = {};
  for (const p of S.POLITIES) {
    if (inRange.has(p.mergeGroup)) {
      if (!g[p.mergeGroup]) g[p.mergeGroup] = { name: p.mergeGroup, members: [] };
      g[p.mergeGroup].members.push(p);
    }
  }
  let activeRule = null;
  if (S.SORT_RULES) {
    activeRule = S.SORT_RULES.find(r => S.BASE_YEAR >= r.yearStart && S.BASE_YEAR <= r.yearEnd);
  }
  return Object.values(g).sort((a, b) => {
    if (activeRule) {
      const getPrio = (g) => {
        if (activeRule.priority && activeRule.priority[g.name] !== undefined) return activeRule.priority[g.name];
        if (activeRule.northernGroups && activeRule.northernGroups.includes(g.name)) return 100;
        if (activeRule.southernGroups && activeRule.southernGroups.includes(g.name)) return 200;
        return 999;
      };
      const aP = getPrio(a), bP = getPrio(b);
      if (aP !== bP) return aP - bP;
    } else {
      function cat(m) { return m.some(p => p.isCentral) ? 0 : (m.some(p => p.isBorder) ? 2 : 1); }
      const aC = cat(a.members), bC = cat(b.members);
      if (aC !== bC) return aC - bC;
    }
    return Math.min(...a.members.map(p => p.startYear)) - Math.min(...b.members.map(p => p.startYear));
  });
}

// ===== 全量渲染 =====
export function renderAll() {
  const raw = getMergeGroups();
  // 固定列始终可见：不在范围内的固定列也加入
  const rawNames = new Set(raw.map(mg => mg.name));
  for (const cid of COLUMN_STATE.pinnedColumnIds) {
    const mg = cid.replace('col-', '');
    if (!rawNames.has(mg)) {
      const members = S.POLITIES.filter(p => p.mergeGroup === mg);
      if (members.length) raw.push({ name: mg, members, outOfRange: true });
    }
  }
  const mgs = applyColumnState(raw);

  const h = document.getElementById('tableHeader'); h.innerHTML = '';
  const yh = document.createElement('div'); yh.className = 'cell col-year'; yh.textContent = '公元'; h.appendChild(yh);
  for (const mg of mgs) {
    const c = document.createElement('div'); c.className = 'cell col-polity' + (mg.pinned ? ' pinned' : '');
    c.dataset.columnId = mg.columnId;
    c.textContent = (mg.pinned ? '📌' : '') + mg.name;
    c.title = mg.members.map(p => p.name + '(' + p.startYear + '~' + p.endYear + ')').join(' | ');
    c.addEventListener('contextmenu', e => {
      e.preventDefault();
      const cid = c.dataset.columnId;
      const isPinned = COLUMN_STATE.pinnedColumnIds.includes(cid);
      const isHidden = COLUMN_STATE.hiddenColumnIds.includes(cid);
      const menu = document.getElementById('ctxMenu');
      let items = '';
      if (isHidden) {
        items += '<div data-act="show" data-cid="' + cid + '">显示此列</div>';
      } else {
        items += '<div data-act="hide" data-cid="' + cid + '">隐藏此列</div>';
        items += isPinned
          ? '<div data-act="unpin" data-cid="' + cid + '">取消固定</div>'
          : '<div data-act="pin" data-cid="' + cid + '">固定此列</div>';
        items += '<div class="ctx-sep"></div>';
        items += '<div data-act="reset">重置所有列</div>';
      }
      menu.innerHTML = items;
      menu.style.display = 'block'; menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
      menu.querySelectorAll('div[data-act]').forEach(d => d.addEventListener('click', () => {
        const act = d.dataset.act, cid2 = d.dataset.cid;
        if (act === 'hide') hideColumn(cid2);
        else if (act === 'show') showColumn(cid2);
        else if (act === 'pin') pinColumn(cid2);
        else if (act === 'unpin') unpinColumn(cid2);
        else if (act === 'reset') { resetColumns(); }
        menu.style.display = 'none';
        renderAll(); updateTimeline(); updateStatus();
      }));
    });
    h.appendChild(c);
  }
  // 点击其他地方关闭右键菜单（只注册一次）
  if (!window._ctxMenuBound) {
    window._ctxMenuBound = true;
    document.addEventListener('click', () => { document.getElementById('ctxMenu').style.display = 'none'; });
  }
  const eh = document.createElement('div'); eh.className = 'cell col-event'; eh.textContent = '重大事件'; h.appendChild(eh);

  // 虚拟滚动：只渲染视口内行 + 缓冲区
  calibrateRowHeight();
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const viewH = window.innerHeight;
  updateVisibleRange(scrollTop, viewH);
  const visibleYears = getVisibleYears();

  const b = document.getElementById('tableBody'); b.innerHTML = '';

  // 顶部 spacer
  const topSpacer = document.createElement('div');
  topSpacer.style.height = getTopSpacerHeight() + 'px';
  b.appendChild(topSpacer);

  for (const y of visibleYears) {
    const yi = S.ALL_YEARS.indexOf(y);
    const row = document.createElement('div');
    row.className = 'row' + (yi % 2 ? ' odd' : ' even') + (y === S.BASE_YEAR ? ' locked' : '');
    row.dataset.year = y;
    const yc = document.createElement('div'); yc.className = 'cell col-year'; yc.textContent = ylYear(y); row.appendChild(yc);
    for (const mg of mgs) {
      const td = document.createElement('div'); td.className = 'cell col-polity';
      td.dataset.pid = mg.members[0].id; td.dataset.year = y; td.dataset.columnId = mg.columnId;
      let found = null, foundPid = null;
      for (const p of mg.members) {
        if (S.YEAR_DATA[y] && S.YEAR_DATA[y][p.id]) { found = S.YEAR_DATA[y][p.id]; foundPid = p.id; break; }
      }
      if (found) {
        td.textContent = found; td.dataset.pid = foundPid;
        if (S.SEARCH_HIGHLIGHT) {
          let hl = false;
          if (S.SEARCH_HIGHLIGHT.pid && S.SEARCH_HIGHLIGHT.pid === foundPid) hl = true;
          if (S.SEARCH_HIGHLIGHT.mg && S.SEARCH_HIGHLIGHT.mg === mg.name) hl = true;
          if (hl && y >= S.SEARCH_HIGHLIGHT.sy && y <= S.SEARCH_HIGHLIGHT.ey) td.classList.add('search-hit');
        }
        if (S.SEARCH_KEYWORD && td.textContent.toLowerCase().includes(S.SEARCH_KEYWORD.toLowerCase())) td.classList.add('search-hit');
      } else {
        td.classList.add('empty'); td.textContent = '—';
      }
      row.appendChild(td);
    }
    const evc = document.createElement('div'); evc.className = 'cell col-event'; evc.dataset.year = y;
    evc.textContent = S.EVENT_DATA[y] || ''; row.appendChild(evc);
    row.addEventListener('click', () => { if (typeof window._onRowClick === 'function') window._onRowClick(y); });
    b.appendChild(row);
  }

  // 底部 spacer
  const bottomSpacer = document.createElement('div');
  bottomSpacer.style.height = getBottomSpacerHeight() + 'px';
  b.appendChild(bottomSpacer);

  // spacer 已撑起滚动高度，无需额外设置
}

// ===== 状态栏 =====
export function updateStatus() {
  let s = '';
  if (S.BASE_YEAR === null) s = '显示全部';
  else if (!S.LOCKED) s = '基准: ' + yl(S.BASE_YEAR) + '年 (N=' + S.N_VAL + ') · 🔓';
  else s = '基准: ' + yl(S.BASE_YEAR) + '年 (N=' + S.N_VAL + '，' + yl(S.BASE_YEAR - S.N_VAL) + '~' + yl(S.BASE_YEAR + S.N_VAL) + ') · 🔒';
  document.getElementById('statusBar').textContent = s;
}

export function scrollToYear(y) {
  window.scrollTo({ top: getScrollTopForYear(y), behavior: 'smooth' });
}

// ===== 时间轴 =====
function createHoverElements(y) {
  const f = document.createDocumentFragment();
  const hd = document.createElement('div'); hd.className = 'hover-dot'; f.appendChild(hd);
  const hl = document.createElement('span'); hl.className = 'hover-lb'; hl.textContent = yl(y); f.appendChild(hl);
  return f;
}

export function renderTimeline() {
  const tl = document.getElementById('timeline'); tl.innerHTML = '';
  const s = S.ALL_YEARS[0], e = S.ALL_YEARS[S.ALL_YEARS.length - 1];
  const onTC = (y) => { if (typeof window._onTimelineClick === 'function') window._onTimelineClick(y); };

  // 200年刻度
  for (let y = Math.ceil(s / 200) * 200; y <= e; y += 200) {
    const t = document.createElement('div'); t.className = 'tm'; t.dataset.year = y;
    t.style.top = y2p(y) + '%';
    const m = document.createElement('div'); m.className = 'tickm'; t.appendChild(m);
    const l = document.createElement('span'); l.className = 'tl'; l.textContent = yl(y); t.appendChild(l);
    t.appendChild(createHoverElements(y));
    t.addEventListener('click', () => onTC(y)); tl.appendChild(t);
  }

  // 朝代标记
  const dyns = [
    { n: '共和', y: -841 }, { n: '春秋', y: -770 }, { n: '战国', y: -403 }, { n: '秦', y: -221 },
    { n: '西汉', y: -202 }, { n: '东汉', y: 25 }, { n: '三国', y: 220 }, { n: '西晋', y: 265 },
    { n: '东晋', y: 317 }, { n: '南北朝', y: 420 }, { n: '隋', y: 581 }, { n: '唐', y: 618 },
    { n: '五代', y: 907 }, { n: '北宋', y: 960 }, { n: '南宋', y: 1127 }, { n: '元', y: 1271 },
    { n: '明', y: 1368 }, { n: '清', y: 1644 }
  ];
  for (const d of dyns) {
    if (d.y >= s && d.y <= e) {
      const t = document.createElement('div'); t.className = 'tm'; t.dataset.year = d.y;
      t.style.top = y2p(d.y) + '%';
      const dot = document.createElement('div'); dot.className = 'dot'; t.appendChild(dot);
      const l = document.createElement('span'); l.className = 'dynm'; l.textContent = d.n; t.appendChild(l);
      t.appendChild(createHoverElements(d.y));
      t.addEventListener('click', () => onTC(d.y)); tl.appendChild(t);
    }
  }

  // 每20年悬停点
  for (let y = Math.ceil(s / 20) * 20; y <= e; y += 20) {
    const exists = document.querySelector(`.tm[data-year="${y}"]`);
    if (!exists) {
      const t = document.createElement('div'); t.className = 'tm'; t.dataset.year = y;
      t.style.top = y2p(y) + '%';
      t.appendChild(createHoverElements(y));
      t.addEventListener('click', () => onTC(y)); tl.appendChild(t);
    }
  }
}

export function updateTimeline() {
  const old = document.querySelector('#tl-cur');
  if (old) old.remove();
  const e = document.createElement('div');
  e.id = 'tl-cur'; e.className = 'cur-lb'; e.textContent = yl(S.BASE_YEAR);
  e.style.position = 'absolute'; e.style.left = '10px'; e.style.width = '30px';
  e.style.height = '14px'; e.style.fontSize = '.5rem'; e.style.color = '#fff';
  e.style.fontWeight = '700'; e.style.textAlign = 'center'; e.style.lineHeight = '14px';
  e.style.zIndex = '5'; e.style.background = '#c0392b'; e.style.borderRadius = '2px';
  e.style.pointerEvents = 'none'; e.style.top = y2p(S.BASE_YEAR) + '%';
  e.style.transform = 'translateY(-50%)';
  document.getElementById('timeline').appendChild(e);
}
