// 全局状态 — 所有模块通过 import 共享同一份引用

export const PARSE_SRC = "chronology.json";
export const POLITY_MAP = "dict/polity-map.json";
export const RULER_MAP = "dict/ruler-map.json";
export const ERA_MAP = "dict/era-map.json";

export let POLITIES = [], RULERS = [], ERAS = [];
export let CHRONOLOGY = { events: {}, cells: {} };
export let YEAR_DATA = {}, EVENT_DATA = {}, ALL_YEARS = [];
export let BASE_YEAR = null, N_VAL = 5, LOCKED = true, SEARCH_HIGHLIGHT = null, SEARCH_KEYWORD = '';
export let RULER_BY_POLITY = {}, TOOLTIP_TIMER = null, LABEL_IDX = {};
export let SORT_RULES = null, SEARCH_RULERS = [];
export let scrollTO = null;

export function setPolities(v) { POLITIES = v; }
export function setRulers(v) { RULERS = v; }
export function setEras(v) { ERAS = v; }
export function setChronology(v) { CHRONOLOGY = v; }
export function setYearData(v) { YEAR_DATA = v; }
export function setEventData(v) { EVENT_DATA = v; }
export function setAllYears(v) { ALL_YEARS = v; }
export function setBaseYear(v) { BASE_YEAR = v; }
export function setNVal(v) { N_VAL = v; }
export function setLocked(v) { LOCKED = v; }
export function setSearchHighlight(v) { SEARCH_HIGHLIGHT = v; }
export function setSearchKeyword(v) { SEARCH_KEYWORD = v; }
export function setRulerByPolity(v) { RULER_BY_POLITY = v; }
export function setTooltipTimer(v) { TOOLTIP_TIMER = v; }
export function setLabelIdx(v) { LABEL_IDX = v; }
export function setSortRules(v) { SORT_RULES = v; }
export function setSearchRulers(v) { SEARCH_RULERS = v; }

// 统一索引层（C-7-2）
export let IDX = {
  polityById: {},
  rulerById: {},
  eraById: {},
  rulersByPolity: {},
  erasByPolity: {},
};
export function setIDX(v) { IDX = v; }
