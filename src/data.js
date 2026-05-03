import * as S from './state.js';

// ===== 中文数字 =====
const CN = { 0: "〇", 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六", 7: "七", 8: "八", 9: "九" };

export function toCN(num) {
  if (num == null) return null; const n = parseInt(num);
  if (n === 1) return "元年"; if (n < 1) return "" + n;
  if (n < 10) return CN[n] + "年";
  if (n < 20) { const u = n % 10; return "十" + (u ? CN[u] : "") + "年"; }
  if (n < 100) {
    const t = Math.floor(n / 10), u = n % 10;
    return ({ 0: "", 1: "十", 2: "二十", 3: "三十", 4: "四十", 5: "五十", 6: "六十", 7: "七十", 8: "八十", 9: "九十" }[t] + (u ? CN[u] : "")) + "年";
  }
  return n + "年";
}

export function yl(y) { return y < 0 ? '前' + Math.abs(y) : '' + y; }
export function ylYear(y) { return y === 1 ? '元年' : (y < 0 ? '前' + Math.abs(y) : y) + '年'; }
export function y2p(y) { return ((y - S.ALL_YEARS[0]) / (S.ALL_YEARS[S.ALL_YEARS.length - 1] - S.ALL_YEARS[0])) * 100; }

// ===== 标签→政权ID =====
export function buildLabelIndex() {
  const lb = {};
  for (const p of S.POLITIES) {
    for (const k of [p.selfName, p.name, ...(p.aliases || [])].filter(Boolean)) {
      if (!lb[k]) lb[k] = [];
      if (!lb[k].includes(p.id)) lb[k].push(p.id);
    }
  }
  return lb;
}

export function getPID(label, year) {
  if (label === "中央纪年") return year <= -207 ? "pol-秦朝" : (year <= 23 ? "pol-西汉" : "pol-东汉");
  if (label === "中央王朝") return year <= 617 ? "pol-隋朝" : "pol-唐朝";
  if (label === "后唐/后晋/后汉") return year <= 936 ? "pol-后唐" : (year <= 946 ? "pol-后晋" : "pol-后汉");
  if (label === "后周/北宋") return year <= 959 ? "pol-后周" : "pol-北宋";
  if (label === "蒙古/元") return year <= 1271 ? "pol-蒙古" : "pol-元";
  if (label === "羌乱/州牧割据") return null;
  const cand = S.LABEL_IDX[label] || [];
  if (!cand.length) return null;
  if (cand.length === 1) return cand[0];
  return cand.filter(pid => {
    const p = S.IDX.polityById[pid];
    return p && p.startYear <= year && p.endYear >= year;
  })[0] || cand[0];
}

// ===== 数据加载 =====
export async function loadAll() {
  try {
  let parsed, pMap, rMap, eMap, evMap, vMap;
  if (window.__CHRONOLOGY_DATA__) {
    const d = window.__CHRONOLOGY_DATA__;
    parsed = d.chronology; pMap = d.polityMap; rMap = d.rulerMap; eMap = d.eraMap; evMap = d.eventMap || null; vMap = d.verificationMap || null;
  } else {
    [parsed, pMap, rMap, eMap, evMap, vMap] = await Promise.all([
      fetch(S.PARSE_SRC).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
      fetch(S.POLITY_MAP).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
      fetch(S.RULER_MAP).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
      fetch(S.ERA_MAP).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
      fetch(S.EVENT_MAP).then(r => r.ok ? r.json() : null),
      fetch(S.VERIFICATION_MAP).then(r => r.ok ? r.json() : null),
    ]);
  }

  S.setPolities(pMap.polities);
  S.setRulers(rMap.rulers);
  S.setEras(eMap.eras);
  S.setSortRules((pMap._meta && pMap._meta.sortRules) || null);
  S.setChronology(parsed);

  const rb = {};
  for (const r of S.RULERS) {
    if (!rb[r.polityId]) rb[r.polityId] = [];
    rb[r.polityId].push(r);
  }
  S.setRulerByPolity(rb);

  // 搜索用君主：按 personId 去重，取 reignEndYear 最晚者
  let sr = S.RULERS;
  if (S.RULERS.some(r => r.personId)) {
    const byP = {};
    for (const r of S.RULERS) {
      const k = r.personId || r.id;
      const e = byP[k];
      if (!e || r.reignEndYear > e.reignEndYear) byP[k] = r;
    }
    sr = Object.values(byP);
  }
  S.setSearchRulers(sr);

  // 年份连续轴（跳过0年）
  const ay = [];
  for (let y = parsed.meta.startYear; y <= parsed.meta.endYear; y++)
    if (y !== 0) ay.push(y);
  S.setAllYears(ay);

  const yd = {}, ed = {};
  for (const y of S.ALL_YEARS) {
    yd[y] = parsed.cells[y] || {};
    const ev = parsed.events[y];
    ed[y] = Array.isArray(ev) ? ev.map(e => e.text).filter(Boolean).join('；') : ev || '';
  }
  S.setYearData(yd);
  S.setEventData(ed);

  // 统一索引层（C-7-2）
  const pById = {}, rById = {}, eById = {}, rByP = {}, eByP = {};
  for (const p of S.POLITIES) { pById[p.id] = p; }
  for (const r of S.RULERS) {
    rById[r.id] = r;
    if (!rByP[r.polityId]) rByP[r.polityId] = [];
    rByP[r.polityId].push(r);
  }
  for (const e of S.ERAS) {
    eById[e.id] = e;
    if (!eByP[e.polityId]) eByP[e.polityId] = [];
    eByP[e.polityId].push(e);
  }
  S.setIDX({ polityById: pById, rulerById: rById, eraById: eById, rulersByPolity: rByP, erasByPolity: eByP });

  // B-8-1: 事件索引
  const evtList = (evMap && evMap.events) || [];
  S.setEvents(evtList);
  const eventById = {}, eventsByYear = {};
  for (const ev of evtList) {
    eventById[ev.id] = ev;
    if (!eventsByYear[ev.year]) eventsByYear[ev.year] = [];
    eventsByYear[ev.year].push(ev);
  }
  S.IDX.eventById = eventById;
  S.IDX.eventsByYear = eventsByYear;

  // B-8-1: verification 查询索引
  const verById = {};
  if (vMap && vMap.items) {
    for (const [key, entry] of Object.entries(vMap.items)) {
      verById[key] = entry;
    }
  }
  S.setVerificationById(verById);
  S.setVerificationRaw(vMap);

  document.getElementById('statusLabel').textContent =
    yl(S.ALL_YEARS[0]) + '~' + yl(S.ALL_YEARS[S.ALL_YEARS.length - 1]) + '年 · ' +
    S.POLITIES.length + '政权 · ' + S.ERAS.length + '年号 · ' + S.RULERS.length + '君主';

  S.setBaseYear(S.ALL_YEARS[0]);
  S.setLocked(true);
  S.setLabelIdx(buildLabelIndex());

  } catch (e) {
    document.getElementById('statusLabel').textContent = '加载失败：' + e.message;
    console.error('loadAll failed:', e);
  }
}
