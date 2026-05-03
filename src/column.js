// 列状态管理（C-7-4）：hidden / pinned / manualOrder + localStorage 持久化

const STORAGE_KEY = 'cht-column-state';
export const MAX_PINNED = 3;

// 初始状态（从 localStorage 恢复）
function loadColumnState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 校验格式
      if (Array.isArray(parsed.hiddenColumnIds) && Array.isArray(parsed.pinnedColumnIds) && Array.isArray(parsed.manualOrder)) {
        return parsed;
      }
    }
  } catch (e) { /* ignore */ }
  return { hiddenColumnIds: [], pinnedColumnIds: [], manualOrder: [] };
}

function saveColumnState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

export let COLUMN_STATE = loadColumnState();

// 暴露给交互层
export function hideColumn(columnId) {
  if (!COLUMN_STATE.hiddenColumnIds.includes(columnId)) {
    COLUMN_STATE.hiddenColumnIds.push(columnId);
    // 从固定列表中移除（隐藏优先）
    COLUMN_STATE.pinnedColumnIds = COLUMN_STATE.pinnedColumnIds.filter(id => id !== columnId);
    saveColumnState(COLUMN_STATE);
  }
}

export function showColumn(columnId) {
  COLUMN_STATE.hiddenColumnIds = COLUMN_STATE.hiddenColumnIds.filter(id => id !== columnId);
  saveColumnState(COLUMN_STATE);
}

export function pinColumn(columnId) {
  if (COLUMN_STATE.hiddenColumnIds.includes(columnId)) return; // 隐藏列不可固定
  if (COLUMN_STATE.pinnedColumnIds.length >= MAX_PINNED) return;
  if (!COLUMN_STATE.pinnedColumnIds.includes(columnId)) {
    COLUMN_STATE.pinnedColumnIds.push(columnId);
    saveColumnState(COLUMN_STATE);
  }
}

export function unpinColumn(columnId) {
  COLUMN_STATE.pinnedColumnIds = COLUMN_STATE.pinnedColumnIds.filter(id => id !== columnId);
  saveColumnState(COLUMN_STATE);
}

export function resetColumns() {
  COLUMN_STATE = { hiddenColumnIds: [], pinnedColumnIds: [], manualOrder: [] };
  saveColumnState(COLUMN_STATE);
}

// 临时显示隐藏列（搜索跳转用），持续到下次手动调整
let tempVisible = new Set();
export function tempShowColumn(columnId) {
  if (COLUMN_STATE.hiddenColumnIds.includes(columnId)) {
    tempVisible.add(columnId);
  }
}
export function clearTempVisible() { tempVisible = new Set(); }

// 获取最终列列表（应用 hidden/pinned/manualOrder）
// 输入：getMergeGroups() 返回的列数组 [{name: mergeGroup, members: [...]}]
// 输出：排序后的可见列 [{name, members, columnId, pinned}]
export function applyColumnState(rawColumns) {
  const withId = rawColumns.map(col => ({
    ...col,
    columnId: 'col-' + col.name,
    pinned: COLUMN_STATE.pinnedColumnIds.includes('col-' + col.name),
  }));

  // 过滤隐藏列（但临时可见的除外）
  const visible = withId.filter(col =>
    !COLUMN_STATE.hiddenColumnIds.includes(col.columnId) || tempVisible.has(col.columnId)
  );

  // 固定列排最前，其余按自然顺序
  const pinned = visible.filter(col => col.pinned);
  const unpinned = visible.filter(col => !col.pinned);

  return [...pinned, ...unpinned];
}
