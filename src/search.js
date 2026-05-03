import * as S from './state.js';
import { yl } from './data.js';
import { navigateTo } from './render.js';

// ===== 搜索 =====
export function searchKeyword() {
  try {
    const q = document.getElementById('keywordSearch').value.trim(); if (!q) return;
    const ckPolity = document.getElementById('chkPolity').checked;
    const ckRuler = document.getElementById('chkRuler').checked;
    const ckEra = document.getElementById('chkEra').checked;
    const warn = document.getElementById('chkWarn');
    if (!ckPolity && !ckRuler && !ckEra) { warn.style.display = 'inline'; return; }
    warn.style.display = 'none';

    const results = [], seen = new Set();

    // ---- 1. 政权搜索 ----
    if (ckPolity) {
      for (const p of S.POLITIES || []) {
        let lv = 0; const pn = p.name;
        if (pn === q) lv = 1;
        else if ((p.aliases || []).some(a => a === q)) lv = 2;
        else if (pn.includes(q)) lv = 3;
        else if (p.selfName && p.selfName === q) lv = 2;
        else if (p.selfName && p.selfName.includes(q)) lv = 3;
        if (lv === 0) continue;
        const key = 'p-' + p.id; if (!seen.has(key)) {
          seen.add(key);
          const dur = (p.startYear < 0 ? '前' + (-p.startYear) : p.startYear) + '~' + (p.endYear < 0 ? '前' + (-p.endYear) : p.endYear) + '年';
          results.push({ t: 'polity', id: p.id, pid: p.id, label: p.name, dur, sy: p.startYear, ey: p.endYear, lv });
        }
      }
    }

    // ---- 2. 君主搜索 ----
    if (ckRuler) {
      for (const r of S.SEARCH_RULERS || []) {
        const pn = (S.IDX.polityById[r.polityId]?.name) || '';
        let lv = 0; const dt = r.displayTitle, na = r.personalName;
        if (dt === q || na === q) lv = 4;
        else if ((r.aliases || []).some(a => a === q)) lv = 5;
        else if (pn.includes(q) || pn === q) lv = 7;
        else if (dt && dt.includes(q)) lv = 8;
        else if (na && na.includes(q)) lv = 8;
        else if ([r.templeTitle, r.posthumousTitle, ...(r.searchLabels || []), pn].filter(Boolean).some(f => f === q)) lv = 7;
        else if ([r.templeTitle, r.posthumousTitle, ...(r.searchLabels || []), pn].filter(Boolean).some(f => f.includes(q))) lv = 8;
        if (lv === 0) continue;
        const key = 'r-' + r.id; if (!seen.has(key)) {
          seen.add(key);
          const reign = yl(r.reignStartYear) + '~' + yl(r.reignEndYear) + '年';
          const detail = [r.templeTitle, r.posthumousTitle, r.personalName].filter(Boolean).join(' · ');
          results.push({ t: 'ruler', id: r.id, pid: r.polityId, label: r.displayTitle || r.personalName, hint: pn + ' · ' + reign, dur: detail, sy: r.reignStartYear, ey: r.reignEndYear, lv });
        }
      }
    }

    // ---- 3. 年号搜索 ----
    if (ckEra) {
      for (const e of S.ERAS || []) {
        const pn = (S.IDX.polityById[e.polityId]?.name) || '';
        let lv = 0; const en = e.name;
        if (en === q) lv = 6;
        else if (en.includes(q)) lv = 9;
        else if ((e.aliases || []).some(a => a === q)) lv = 7;
        else if ((e.searchLabels || []).some(s => s === q)) lv = 8;
        else if ((e.aliases || []).some(a => a.includes(q)) || (e.searchLabels || []).some(s => s.includes(q))) lv = 9;
        if (lv === 0) continue;
        const key = 'e-' + e.id; if (!seen.has(key)) {
          seen.add(key);
          const period = yl(e.startYear) + '~' + yl(e.endYear) + '年';
          let ruler = '';
          for (const r of S.SEARCH_RULERS || []) {
            if (r.polityId === e.polityId && r.reignStartYear <= e.startYear && r.reignEndYear >= e.startYear) {
              ruler = (r.displayTitle || r.personalName); break;
            }
          }
          const hint = pn + (ruler ? ' · ' + ruler : '') + ' · ' + period;
          results.push({ t: 'era', id: e.id, pid: e.polityId, label: e.name, hint, sy: e.startYear, ey: e.endYear, lv });
        }
      }
    }

    if (!results.length) { alert('未找到 "' + q + '"'); return; }
    results.sort((a, b) => a.lv - b.lv || a.sy - b.sy);
    showSearchPanel(q, results);
  } catch (e) { alert('搜索出错: ' + e.message); }
}

export function showSearchPanel(q, results) {
  const panel = document.getElementById('searchPanel'), items = document.getElementById('panelItems');
  panel.classList.add('open'); items.innerHTML = '';

  const tempItem = document.createElement('div'); tempItem.className = 'result-item';
  tempItem.innerHTML = '<span class="tag polity">测</span> <b>测</b>'; tempItem.style.visibility = 'hidden';
  items.appendChild(tempItem);
  const itemH = tempItem.getBoundingClientRect().height || 22;
  items.removeChild(tempItem);

  const panelH = panel.getBoundingClientRect().height;
  const headerEl = panel.querySelector('.panel-header');
  const headerH = headerEl ? headerEl.getBoundingClientRect().height : 30;
  const fixedInBody = 42;
  const availForItems = Math.max(panelH - headerH - 10 - fixedInBody, itemH * 2);
  const PAGE_SIZE = Math.max(Math.floor(availForItems / itemH), 1);
  let page = 0, totalPages = Math.ceil(results.length / PAGE_SIZE);

  function renderPage() {
    const start = page * PAGE_SIZE, end = Math.min(start + PAGE_SIZE, results.length);
    const pageResults = results.slice(start, end);
    document.getElementById('panelTitle').textContent = '搜索结果：' + q;

    items.textContent = ''; // 清空
    const TAG_LABELS = { era: '年号', polity: '政权', ruler: '君主' };

    // 结果统计
    const info = document.createElement('div');
    info.style.cssText = 'font-size:.65rem;color:#8b6e4e;margin-bottom:3px';
    info.textContent = '共 ' + results.length + ' 条' + (totalPages > 1 ? ' · 第' + (page + 1) + '/' + totalPages + '页' : '');
    items.appendChild(info);

    // 翻页提示
    if (totalPages > 1) {
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:.6rem;color:#aaa;margin-bottom:4px';
      hint.textContent = '← → 翻页 | ↑↓ 选择 | Enter 跳转 | Esc 关闭';
      items.appendChild(hint);

      const pgDiv = document.createElement('div');
      pgDiv.style.cssText = 'text-align:center;margin-bottom:4px;font-size:.62rem';
      for (let i = 0; i < totalPages; i++) {
        const sp = document.createElement('span');
        sp.dataset.pg = i;
        sp.textContent = i + 1;
        sp.style.cssText = 'cursor:pointer;padding:1px 6px;border-radius:3px;margin:0 2px;' +
          (i === page ? 'color:#1D4C50;font-weight:700;background:rgba(29,76,80,.12)' : 'color:#888');
        sp.addEventListener('click', () => { page = parseInt(sp.dataset.pg); renderPage(); });
        pgDiv.appendChild(sp);
      }
      items.appendChild(pgDiv);
    }

    let sel = -1, els = [];
    for (const r of pageResults) {
      const d = document.createElement('div'); d.className = 'result-item'; d.tabIndex = -1;

      const tag = document.createElement('span'); tag.className = 'tag ' + r.t; tag.textContent = TAG_LABELS[r.t]; d.appendChild(tag);
      d.appendChild(document.createTextNode(' '));
      const b = document.createElement('b'); b.textContent = r.label; d.appendChild(b);

      if (r.t === 'polity') { const s = document.createElement('span'); s.style.cssText = 'font-size:.62rem;color:#8b6e4e'; s.textContent = ' ' + r.dur; d.appendChild(s); }
      if (r.t === 'ruler') { const s = document.createElement('span'); s.style.cssText = 'font-size:.62rem;color:#8b6e4e'; s.textContent = ' ' + r.hint; d.appendChild(s); const s2 = document.createElement('span'); s2.style.cssText = 'font-size:.6rem;color:#aaa'; s2.textContent = ' ' + r.dur; d.appendChild(s2); }
      if (r.t === 'era') { const s = document.createElement('span'); s.style.cssText = 'font-size:.62rem;color:#8b6e4e'; s.textContent = ' ' + r.hint; d.appendChild(s); }

      d.addEventListener('click', () => { nr(results[start + sel]); closePanel(); });
      d.addEventListener('mouseenter', () => { els.forEach(x => x.style.background = ''); d.style.background = '#f0e8d8'; sel = els.indexOf(d); d.focus(); });
      items.appendChild(d); els.push(d);
    }
    panel.focus();
    if (els.length > 0) { els.forEach(x => x.style.background = ''); els[0].style.background = '#f0e8d8'; sel = 0; els[0].focus(); }
    panel.onkeydown = function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); const n = (sel + 1) % els.length; els.forEach(x => x.style.background = ''); els[n].style.background = '#f0e8d8'; sel = n; els[n].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); const p = (sel - 1 + els.length) % els.length; els.forEach(x => x.style.background = ''); els[p].style.background = '#f0e8d8'; sel = p; els[p].focus(); }
      else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); nr(results[start + sel]); closePanel(); }
      else if (e.key === 'Escape') { closePanel(); }
      else if (e.key === 'ArrowLeft' && totalPages > 1) { e.preventDefault(); page = page > 0 ? page - 1 : totalPages - 1; renderPage(); }
      else if (e.key === 'ArrowRight' && totalPages > 1) { e.preventDefault(); page = page < totalPages - 1 ? page + 1 : 0; renderPage(); }
    };
  }
  function nr(r) {
    try {
      const pid = r.pid, sy = r.sy, ey = r.ey;
      S.setSearchKeyword(q);
      const hl = (pid ? { pid, sy, ey } : { pid: null, sy: null, ey: null });
      if (pid && r.t) {
        const pp = S.IDX.polityById[pid];
        if (pp) hl.mg = pp.mergeGroup;
      }
      navigateTo({ year: parseInt(sy), highlight: hl });
    } catch (e) { alert('导航出错: ' + e.message); }
  }
  renderPage();
}

export function closePanel() {
  document.getElementById('searchPanel').classList.remove('open');
  document.getElementById('keywordSearch').focus();
}
