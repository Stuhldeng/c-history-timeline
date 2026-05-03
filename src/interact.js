import * as S from './state.js';
import { yl } from './data.js';
import { renderAll, updateStatus, updateTimeline, navigateTo } from './render.js';
import { searchKeyword } from './search.js';
import { updateVisibleRange, getYearFromScroll } from './virtual-scroll.js';

// ===== 交互事件 =====
export function onRowClick(y) { navigateTo({ year: y }); }
export function onTimelineClick(y) { navigateTo({ year: y }); }

export function updateN(v) {
  S.setNVal(parseInt(v));
  document.getElementById('nVal').textContent = S.N_VAL;
  if (S.LOCKED && S.BASE_YEAR !== null) { renderAll(); updateStatus(); }
}

export function toggleLock(c) {
  S.setLocked(c);
  document.getElementById('lockLabel').textContent = c ? '锁' : '随';
  if (S.BASE_YEAR !== null) { renderAll(); updateStatus(); }
}

export function jumpYear() {
  const y = parseInt(document.getElementById('yearSearch').value);
  if (isNaN(y) || y < S.ALL_YEARS[0] || y > S.ALL_YEARS[S.ALL_YEARS.length - 1]) return;
  navigateTo({ year: y });
}

export function showHelp() { document.body.classList.add('help-open'); }
export function closeHelp() { document.body.classList.remove('help-open'); }

// ===== Tooltip =====
function grfy(pid, y) {
  const rs = S.IDX.rulersByPolity[pid]; if (!rs) return null;
  for (const r of rs) { if (r.reignStartYear <= y && r.reignEndYear >= y) return r; }
  return null;
}

function showTooltip(mx, my, pid, y, txt) {
  const tip = document.getElementById('tooltip');
  tip.textContent = ''; // 清除旧内容
  const po = S.IDX.polityById[pid], ru = grfy(pid, y);

  const addDiv = (cls, text) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; tip.appendChild(d); };

  addDiv('tp-polity', po ? po.name : pid);
  if (ru) {
    if (ru.displayTitle) addDiv('tp-ruler', ru.displayTitle);
    if (ru.templeTitle) addDiv('tp-ruler', '庙号：' + ru.templeTitle);
    if (ru.posthumousTitle) addDiv('tp-ruler', '谥号：' + ru.posthumousTitle);
    if (ru.personalName) addDiv('tp-ruler', '姓名：' + ru.personalName);
  }
  if (txt && txt !== '—') addDiv('tp-era', txt);
  addDiv('tp-year', y + '年');

  tip.style.left = (mx + 12) + 'px'; tip.style.top = Math.max(10, my - 10) + 'px'; tip.classList.add('show');
}

function clearTooltip() {
  if (S.TOOLTIP_TIMER) { clearTimeout(S.TOOLTIP_TIMER); S.setTooltipTimer(null); }
  document.getElementById('tooltip').classList.remove('show');
}

// ===== 事件绑定 =====
export function bindEvents() {
  // Table body tooltip
  document.getElementById('tableBody').addEventListener('mouseover', e => {
    const c = e.target.closest('.cell');
    if (!c || c.classList.contains('col-year') || c.classList.contains('empty')) { clearTooltip(); return; }
    const pid = c.dataset.pid, y = parseInt(c.dataset.year);
    if (!pid || isNaN(y)) return; clearTooltip();
    S.setTooltipTimer(setTimeout(() => showTooltip(e.clientX, e.clientY, pid, y, c.textContent), 800));
  });
  document.getElementById('tableBody').addEventListener('mousemove', e => {
    const tip = document.getElementById('tooltip');
    if (tip.classList.contains('show')) { tip.style.left = (e.clientX + 12) + 'px'; tip.style.top = Math.max(10, e.clientY - 10) + 'px'; }
  });
  document.getElementById('tableBody').addEventListener('mouseout', e => { if (!e.target.closest('.cell')) return; clearTooltip(); });

  // Scroll handling: virtual scroll update + unlock follow
  let scrollPending = false;
  document.addEventListener('scroll', () => {
    if (scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(() => {
      scrollPending = false;
      const st = window.scrollY || document.documentElement.scrollTop;
      const vh = window.innerHeight;
      // 虚拟滚动：可见范围变化则重绘
      if (updateVisibleRange(st, vh)) {
        renderAll();
        if (S.BASE_YEAR != null) updateTimeline();
        updateStatus();
      }
      // 解锁跟随：滚动位置反推中间行所在年份
      if (!S.LOCKED) {
        const cy = getYearFromScroll(st);
        if (cy && cy !== S.BASE_YEAR) {
          S.setBaseYear(cy); renderAll(); updateTimeline(); updateStatus();
        }
      }
    });
  }, { passive: true });

  // Search inputs
  document.getElementById('yearSearch').addEventListener('keydown', e => { if (e.key === 'Enter') jumpYear(); });
  document.getElementById('keywordSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { searchKeyword(); } });

  // Checkbox auto-search
  document.querySelectorAll('.chk-box input').forEach(cb => {
    cb.addEventListener('change', function () {
      const warn = document.getElementById('chkWarn');
      if (!document.getElementById('chkPolity').checked && !document.getElementById('chkRuler').checked && !document.getElementById('chkEra').checked) {
        warn.style.display = 'inline';
      } else {
        warn.style.display = 'none';
        if (document.getElementById('searchPanel').classList.contains('open')) searchKeyword();
      }
    });
  });

  // Keyboard ← → for year navigation
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (document.getElementById('searchPanel').classList.contains('open')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const d = e.key === 'ArrowLeft' ? -1 : 1, i = S.ALL_YEARS.indexOf(S.BASE_YEAR);
      if (i >= 0) {
        navigateTo({ year: S.ALL_YEARS[Math.max(0, Math.min(S.ALL_YEARS.length - 1, i + d))] });
      }
    }
  });

  // Resize 时重新校准行高并重绘
  window.addEventListener('resize', () => {
    import('./virtual-scroll.js').then(vs => {
      vs.calibrateRowHeight();
      renderAll(); updateTimeline(); updateStatus();
    });
  });

  // Expose for render.js callbacks
  window._onRowClick = onRowClick;
  window._onTimelineClick = onTimelineClick;
}
