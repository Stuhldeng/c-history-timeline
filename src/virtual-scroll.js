// 虚拟滚动（C-7-6）：只渲染视口内行 + 缓冲区
import * as S from './state.js';

let ROW_HEIGHT = 19; // 实测约 19px（可运行时校准）
const BUFFER = 12;    // 上下各缓冲 12 行

export let visibleRange = { first: 0, last: 0 };
let lastScrollTop = 0, lastViewH = 0;

// 从实际 DOM 校准行高
export function calibrateRowHeight() {
  const existing = document.querySelector('.table-body .row');
  if (existing) {
    ROW_HEIGHT = Math.max(existing.getBoundingClientRect().height, 16);
  }
}

export function getTotalHeight() {
  return S.ALL_YEARS.length * ROW_HEIGHT;
}

export function getScrollTopForYear(year) {
  const idx = S.ALL_YEARS.indexOf(year);
  if (idx < 0) return 0;
  // 滚动到该行在视口 1/3 处
  return Math.max(0, idx * ROW_HEIGHT - window.innerHeight / 3);
}

// 根据滚动位置计算可见范围，返回 true 表示范围发生变化
export function updateVisibleRange(scrollTop, viewportHeight) {
  if (scrollTop === lastScrollTop && viewportHeight === lastViewH) return false;
  lastScrollTop = scrollTop;
  lastViewH = viewportHeight;

  const total = S.ALL_YEARS.length;
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
  const last = Math.min(total - 1, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER);

  if (first !== visibleRange.first || last !== visibleRange.last) {
    visibleRange = { first, last };
    return true;
  }
  return false;
}

export function getVisibleYears() {
  const years = [];
  for (let i = visibleRange.first; i <= visibleRange.last; i++) {
    years.push(S.ALL_YEARS[i]);
  }
  return years;
}

export function getTopSpacerHeight() {
  return visibleRange.first * ROW_HEIGHT;
}

export function getBottomSpacerHeight() {
  const total = S.ALL_YEARS.length;
  return Math.max(0, (total - visibleRange.last - 1) * ROW_HEIGHT);
}

// 从滚动位置反推中间行所属年份（用于解锁跟随）
export function getYearFromScroll(scrollTop) {
  const idx = Math.round((scrollTop + window.innerHeight / 3) / ROW_HEIGHT);
  return S.ALL_YEARS[Math.max(0, Math.min(S.ALL_YEARS.length - 1, idx))];
}
