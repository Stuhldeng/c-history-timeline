import { loadAll } from './data.js';
import { renderTimeline, renderAll, updateTimeline, updateStatus } from './render.js';
import { bindEvents, showHelp, closeHelp, updateN, toggleLock, jumpYear } from './interact.js';
import { searchKeyword, closePanel } from './search.js';
import { showColumnPanel, closeColumnPanel } from './column-ui.js';
import { openDatabase, closeDatabase, switchTab, setFilter } from './database.js';
import * as S from './state.js';

async function init() {
  await loadAll();
  if (S.LOAD_ERROR) {
    const app = document.getElementById('app');
    app.textContent = '';
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'padding:40px;text-align:center;font-size:.9rem;color:#c0392b';
    const h2 = document.createElement('h2'); h2.textContent = '加载失败'; errDiv.appendChild(h2);
    const p = document.createElement('p'); p.style.cssText = 'color:#666;font-size:.8rem;word-break:break-all'; p.textContent = S.LOAD_ERROR; errDiv.appendChild(p);
    const retryBtn = document.createElement('button'); retryBtn.id = 'retryBtn'; retryBtn.style.cssText = 'margin-top:12px;padding:6px 20px;border:1px solid #c0392b;border-radius:4px;background:transparent;color:#c0392b;cursor:pointer;font-size:.8rem'; retryBtn.textContent = '重试'; errDiv.appendChild(retryBtn);
    app.appendChild(errDiv);
    retryBtn.addEventListener('click', () => { location.reload(); });
    return;
  }
  renderTimeline();
  bindEvents();
  document.getElementById('lockToggle').checked = true;
  renderAll();
  updateTimeline();
  updateStatus();

  // 事件绑定（替代 HTML onclick/onchange/oninput）
  document.getElementById('lockToggle').addEventListener('change', function() { toggleLock(this.checked); });
  document.getElementById('nSlider').addEventListener('input', function() { updateN(this.value); });
  document.getElementById('yearSearch').addEventListener('keydown', e => { if (e.key === 'Enter') jumpYear(); });
  document.getElementById('keywordSearch').addEventListener('keydown', e => { if (e.key === 'Enter') searchKeyword(); });
  document.querySelector('[data-act="jumpYear"]')?.addEventListener('click', jumpYear);
  document.querySelector('[data-act="search"]')?.addEventListener('click', searchKeyword);
  document.querySelector('[data-act="columns"]')?.addEventListener('click', showColumnPanel);
  document.querySelector('[data-act="database"]')?.addEventListener('click', () => {
    if (document.getElementById('databasePanel').classList.contains('open')) closeDatabase();
    else openDatabase();
  });
  document.querySelector('[data-act="help"]')?.addEventListener('click', showHelp);
  document.getElementById('columnClose')?.addEventListener('click', closeColumnPanel);
  document.getElementById('searchClose')?.addEventListener('click', closePanel);
  document.getElementById('dbClose')?.addEventListener('click', closeDatabase);
  document.querySelector('.top-bar')?.addEventListener('click', e => {
    if (!document.getElementById('databasePanel').classList.contains('open')) return;
    if (e.target.closest('.top-actions') || e.target.closest('.search-box') || e.target.closest('input') || e.target.closest('label')) return;
    closeDatabase();
  });
  document.getElementById('helpClose')?.addEventListener('click', closeHelp);
  document.querySelectorAll('.db-tab').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
  });
  document.getElementById('dbFilter').addEventListener('input', function() { setFilter(this.value); });

  // 搜索框 / 键徽标控制
  const kbd = document.getElementById('searchKbd');
  const ks = document.getElementById('keywordSearch');
  if (kbd && ks) {
    ks.addEventListener('focus', () => { kbd.style.display = 'none'; ks.style.paddingLeft = '5px'; });
    ks.addEventListener('blur', () => { if (!ks.value) { kbd.style.display = 'inline-flex'; ks.style.paddingLeft = '18px'; } });
    ks.addEventListener('input', () => {
      if (ks.value) { kbd.style.display = 'none'; ks.style.paddingLeft = '5px'; }
      else { kbd.style.display = 'inline-flex'; ks.style.paddingLeft = '18px'; }
    });
  }
  showHelp();
}

init();
