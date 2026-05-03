// 列管理面板 UI（C-7-5）— 筛选 + 可滚动 + 隐藏/固定/重置
import * as S from './state.js';
import {
  COLUMN_STATE, hideColumn, showColumn, pinColumn, unpinColumn, resetColumns, MAX_PINNED
} from './column.js';
import { renderAll, updateTimeline, updateStatus } from './render.js';

const PERIODS = ['先秦', '秦汉', '魏晋南北朝', '隋唐五代', '宋辽金', '元明清'];
let filters = { period: null, central: false, border: false, hidden: false };

function rerender() { renderAll(); updateTimeline(); updateStatus(); }

export function showColumnPanel() {
  const panel = document.getElementById('columnPanel');
  filters = { period: null, central: false, border: false, hidden: false };
  panel.classList.add('open');
  renderPanel();
  panel.onkeydown = e => { if (e.key === 'Escape') closeColumnPanel(); };
}

export function closeColumnPanel() {
  document.getElementById('columnPanel').classList.remove('open');
}

function renderPanel() {
  const items = document.getElementById('columnItems');
  const hidden = new Set(COLUMN_STATE.hiddenColumnIds);
  const pinned = new Set(COLUMN_STATE.pinnedColumnIds);

  // 聚合列
  const mgMap = {};
  for (const p of S.POLITIES) {
    if (!mgMap[p.mergeGroup]) mgMap[p.mergeGroup] = { name: p.mergeGroup, members: [], isCentral: false, isBorder: false, period: p.period };
    mgMap[p.mergeGroup].members.push(p);
    if (p.isCentral) mgMap[p.mergeGroup].isCentral = true;
    if (p.isBorder) mgMap[p.mergeGroup].isBorder = true;
  }
  const columns = Object.values(mgMap).sort((a, b) => {
    if (a.isCentral !== b.isCentral) return a.isCentral ? -1 : 1;
    return Math.min(...a.members.map(p => p.startYear)) - Math.min(...b.members.map(p => p.startYear));
  });

  // 应用筛选
  let filtered = columns;
  if (filters.period) filtered = filtered.filter(c => c.period === filters.period);
  if (filters.central) filtered = filtered.filter(c => c.isCentral);
  if (filters.border) filtered = filtered.filter(c => c.isBorder);
  if (filters.hidden) filtered = filtered.filter(c => hidden.has('col-' + c.name));
  else filtered = filtered; // 默认不显示隐藏列在正常列表中... actually let me show hidden at bottom

  // 排序：固定 → 可见 → 隐藏
  const pinnedCols = filtered.filter(c => pinned.has('col-' + c.name) && !hidden.has('col-' + c.name));
  const visibleCols = filtered.filter(c => !pinned.has('col-' + c.name) && !hidden.has('col-' + c.name));
  const hiddenCols = filtered.filter(c => hidden.has('col-' + c.name));
  const sorted = [...pinnedCols, ...visibleCols, ...hiddenCols];

  // 清空
  items.textContent = '';

  // Filter tags
  const tagRow = document.createElement('div');
  tagRow.style.cssText = 'font-size:.6rem;margin-bottom:4px;display:flex;flex-wrap:wrap;gap:3px';

  function makeTag(label, key, val) {
    const sp = document.createElement('span');
    sp.className = 'col-tag' + (filters[key] === val ? ' active' : '');
    sp.dataset.fkey = key; sp.dataset.fval = val || '';
    sp.textContent = label;
    sp.addEventListener('click', () => {
      if (val === '') filters[key] = null;
      else if (key === 'period') filters.period = filters.period === val ? null : val;
      else filters[key] = !filters[key];
      if (key === 'central' && filters.central) { filters.border = false; filters.hidden = false; }
      if (key === 'border' && filters.border) { filters.central = false; filters.hidden = false; }
      if (key === 'hidden' && filters.hidden) { filters.central = false; filters.border = false; }
      if (key === 'period' && filters.period) { filters.central = false; filters.border = false; filters.hidden = false; }
      renderPanel();
    });
    return sp;
  }

  PERIODS.forEach(p => tagRow.appendChild(makeTag(p, 'period', p)));
  tagRow.appendChild(makeTag('中央', 'central', true));
  tagRow.appendChild(makeTag('边疆', 'border', true));
  tagRow.appendChild(makeTag('已隐藏', 'hidden', true));
  tagRow.appendChild(makeTag('全部', 'period', null));
  items.appendChild(tagRow);

  // 统计
  const stats = document.createElement('div');
  stats.style.cssText = 'font-size:.6rem;color:#8b6e4e;margin-bottom:4px';
  stats.textContent = `${filtered.length} 列 · 固定 ${COLUMN_STATE.pinnedColumnIds.length}/${MAX_PINNED} · 隐藏 ${COLUMN_STATE.hiddenColumnIds.length}`;
  items.appendChild(stats);

  // 列列表
  function makeBtn(text, act, cid, extraClass, disabled) {
    const btn = document.createElement('button');
    btn.className = 'col-btn' + (extraClass ? ' ' + extraClass : '');
    btn.dataset.act = act; btn.dataset.cid = cid;
    btn.textContent = text;
    if (disabled) btn.disabled = true;
    btn.addEventListener('click', () => {
      if (act === 'hide') { hideColumn(cid); rerender(); }
      else if (act === 'show') { showColumn(cid); rerender(); }
      else if (act === 'pin') { pinColumn(cid); rerender(); }
      else if (act === 'unpin') { unpinColumn(cid); rerender(); }
      renderPanel();
    });
    return btn;
  }

  for (const col of sorted) {
    const cid = 'col-' + col.name;
    const isHidden = hidden.has(cid);
    const isPinned = pinned.has(cid);
    const pinDisabled = isHidden || (!isPinned && COLUMN_STATE.pinnedColumnIds.length >= MAX_PINNED);

    const item = document.createElement('div'); item.className = 'col-item';
    if (isHidden) item.style.opacity = '.5';

    const label = document.createElement('span');
    label.className = 'col-label' + (isPinned ? ' pinned-label' : '');
    label.textContent = (isPinned ? '📌' : '') + col.name + (col.isCentral ? ' ☆' : col.isBorder ? ' ◇' : '');
    item.appendChild(label);

    const periodHint = document.createElement('span');
    periodHint.style.cssText = 'font-size:.55rem;color:#aaa';
    periodHint.textContent = ' ' + (col.period || '');
    label.appendChild(periodHint);

    if (isHidden) {
      item.appendChild(makeBtn('显示', 'show', cid));
    } else {
      item.appendChild(makeBtn('隐藏', 'hide', cid));
      item.appendChild(makeBtn(isPinned ? '取消固定' : '固定', isPinned ? 'unpin' : 'pin', cid, isPinned ? 'active' : '', pinDisabled));
    }
    items.appendChild(item);
  }

  // 重置按钮
  const resetDiv = document.createElement('div'); resetDiv.className = 'col-reset';
  const resetBtn = document.createElement('button'); resetBtn.textContent = '重置所有列设置';
  resetBtn.addEventListener('click', () => { resetColumns(); rerender(); renderPanel(); });
  resetDiv.appendChild(resetBtn);
  items.appendChild(resetDiv);
}
