import { loadAll } from './data.js';
import { renderTimeline, renderAll, updateTimeline, updateStatus } from './render.js';
import { bindEvents } from './interact.js';
import * as S from './state.js';

async function init() {
  await loadAll();
  renderTimeline();
  bindEvents();
  document.getElementById('lockToggle').checked = true;
  renderAll();
  updateTimeline();
  updateStatus();
}

init();
