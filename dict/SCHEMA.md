# 数据字段规范

> 版本：v0.82 | 最后更新：2026-05-05

本文件定义 `dict/` 目录下核心数据文件（polity / ruler / era / event）的字段规范。字段分三级：

- **required** — 必须存在且非空，缺失导致构建失败
- **optional** — 可存在，可为 null / 空字符串 / 空数组
- **reserved** — 已定义但尚未填充，为后续版本预留

每字段标注领域归属：**fact**（历史事实）、**display**（展示）、**search**（搜索）、**meta**（管理元数据）。

---

## 一、通用规则

### 年份

- 公元前用负整数（`-841` = 前 841 年），公元后用正整数
- **无公元 0 年**：前 1 年的下一年直接是 1 年
- 年份字段必须为整数

### ID 规则

| 类型 | 格式 | 示例 | 说明 |
|------|------|------|------|
| polity | `pol-{史称}` | `pol-秦朝` | 用史称避免同名冲突 |
| ruler | `rn-{政权名}-{displayTitle}[-{序号}]` | `rn-秦朝-始皇帝`, `rn-唐朝-中宗-2` | 政权名取 polity.id 的 `pol-` 后缀；同政权同 displayTitle 加序号后缀 |
| era | `era-{年号名}[-{政权名}][-{序号}]` | `era-建元-西汉`, `era-至元-元-2` | 同年号多政权加政权名后缀；同政权同年号加序号 |
| event | `evt-{year}{BC/AD}-{序号}` | `evt-841BC-01` | BC 年加 BC 后缀 |

- id 必须在同类型内**全局唯一**（重复导致构建失败）
- 已有 id **不可更改**（会破坏 chronology 引用和 review 标注）
- 同一实体的其他称呼用 `aliases` 字段

---

## 二、polity-map.json

### 顶层结构

```json
{ "_meta": { "name": "polity-map", "version": "0.82.0", ... }, "polities": [ ... ] }
```

### polity 条目

| 字段 | 级别 | 类型 | 领域 | 说明 |
|------|------|------|------|------|
| `id` | required | string | fact | `pol-{史称}` |
| `name` | required | string | fact | 通用政权名 |
| `startYear` | required | integer | fact | 政权起始年 |
| `endYear` | required | integer | fact | 政权结束年 |
| `mergeGroup` | required | string | fact | 列归并组名，同组政权同列显示 |
| `isCentral` | required | boolean | fact | 是否中央王朝 |
| `isBorder` | required | boolean | fact | 是否边疆政权 |
| `period` | required | string | meta | 所属时期（6 枚举之一） |
| `selfName` | optional | string | fact | 自称国号，如周的 `selfName: "周"` |
| `aliases` | optional | string[] | search | 政权别名 |
| `durationRaw` | optional | string | meta | 存续时间原文，仅供人工参考 |

**时期枚举（6 个）：**

| 值 | 涵盖范围 |
|----|----------|
| `先秦` | 前 841 年至秦统一前 |
| `秦汉` | 秦统一至东汉亡（220） |
| `魏晋南北朝` | 三国至隋建前 |
| `隋唐五代` | 隋建（581）至北宋建前 |
| `宋辽金` | 北宋建（960）至元建前 |
| `元明清` | 元建（1271）至清亡（1911） |

---

## 三、ruler-map.json

### ruler 条目

| 字段 | 级别 | 类型 | 领域 | 说明 |
|------|------|------|------|------|
| `id` | required | string | fact | `rn-{政权名}-{displayTitle}[-{序号}]` |
| `polityId` | required | string | fact | 所属政权 id，必须存在于 polity-map |
| `reignStartYear` | required | integer | fact | 在位起始年 |
| `reignEndYear` | required | integer | fact | 在位结束年 |
| `displayTitle` | required | string | display | 显示名，详见下方规则 |
| `searchLabels` | required | string[] | search | 搜索标签（政权+称号+姓名组合） |
| `uncertain` | required | boolean | meta | 数据是否存疑 |
| `personalName` | optional | string | fact | 本人姓名，如 `嬴政` |
| `posthumousTitle` | optional | string | fact | 谥号，如 `汉武帝` |
| `templeTitle` | optional | string | fact | 庙号，如 `唐太宗` |
| `aliases` | optional | string[] | search | 别名列表 |
| `eraNames` | optional | string[] | fact | 该君主**亲自启用的年号**名列表（不含即位当年沿用的旧年号） |

### displayTitle 填充规则

按以下优先级生成默认值：

1. **有谥号** → 政权名 + 谥号简称（如 `汉武帝`）
   - "皇帝"→"帝"；南北朝、五代保留"孝"字，其他省略
2. **有庙号** → 政权名 + 庙号（如 `唐太宗`）
3. **有年号**（明清）→ 年号 + 帝（如 `康熙帝`）
4. **有 personalName**：
   - 边疆政权 → 直接用称号（如 `东明圣王`）
   - 十六国 → 直接用姓名（如 `刘聪`）
   - 其他 → 政权名 + 姓名（如 `秦嬴政`）
5. 以上皆空 → 取 id 中 `rn-{政权名}-` 之后的部分

**政权名**取 `selfName`（若有），否则取 `name`。例外：南北朝、五代十国一律取 `name`（史称）。

### displayTitle 在年表中的使用

无年号时期，单元格文本 = `displayTitle` + 中文纪年（如 `汉武帝元年`）。

### 跨政权君主预留字段

| 字段 | 级别 | 类型 | 说明 |
|------|------|------|------|
| `personId` | optional | string | 跨政权人物统一标识，如 `person-嬴政` |
| `continuityGroup` | optional | string | 连续纪年组标识 |
| `phaseType` | optional | string | `founder-transition` / `restoration` / `polity-renaming` |
| `regnalCountStartYear` | optional | integer | 纪年起算年（跨政权连续纪年） |

---

## 四、era-map.json

### era 条目

| 字段 | 级别 | 类型 | 领域 | 说明 |
|------|------|------|------|------|
| `id` | required | string | fact | `era-{年号名}[-{政权名}][-{序号}]` |
| `name` | required | string | fact | 年号名，如 `建元` |
| `polityId` | required | string | fact | 所属政权 id |
| `startYear` | required | integer | fact | 年号起始年 |
| `endYear` | required | integer | fact | 年号结束年 |
| `searchLabels` | required | string[] | search | 搜索标签 |
| `aliases` | optional | string[] | search | 年号别名（预留） |
| `countStartYear` | optional | integer | fact | 纪年起算年。用于沿用他政权年号但不重置纪年的情况（如前凉沿用晋建兴，317 年为建兴五年则 countStartYear=313） |

### 跨政权年号预留字段

| 字段 | 级别 | 类型 | 说明 |
|------|------|------|------|
| `continuityGroup` | optional | string | 连续纪年组标识 |
| `phaseType` | optional | string | `cross-polity` / `restoration` |

---

## 五、event-map.json

### event 条目

| 字段 | 级别 | 类型 | 领域 | 说明 |
|------|------|------|------|------|
| `id` | required | string | fact | `evt-{year}{BC/AD}-{序号}` |
| `year` | required | integer | fact | 事件发生年 |
| `title` | required | string | fact | 事件标题（简短） |
| `text` | required | string | fact | 年表显示文本 |
| `level` | required | string | meta | `major` / `minor` |
| `type` | optional | string | meta | 事件类型枚举 |
| `relatedPolities` | optional | string[] | fact | 关联政权 id 列表 |
| `description` | optional | string | fact | 详细描述 |
| `aliases` | optional | string[] | search | 搜索别名 |

**事件类型枚举：** `political` / `military` / `succession` / `diplomacy` / `economy` / `culture` / `disaster` / `institution`

---

## 六、verification-map.json

### 顶层结构

```json
{ "_meta": { "keyFormat": "{type}:{id}", "types": ["polity","ruler","era","event"] }, "items": { ... } }
```

### item 条目

| 字段 | 级别 | 类型 | 说明 |
|------|------|------|------|
| `method` | required | string | `human` / `ai` / `error` |
| `confidence` | required | string | human/error → `absolute`；ai → `high` / `medium` / `low` |
| `verifiedBy` | required | string | 校验者标识 |
| `verifiedAt` | required | string | 校验日期（ISO 格式） |
| `note` | required | string | 校验说明 |
| `appliesTo` | optional | string | 关联的 validation 问题类别 |

### 校验规则

1. **人工校验**：`method: "human"`, `confidence: "absolute"`，仅限用户本人
2. **错误报告**：`method: "error"`, `confidence: "absolute"`，仅限用户本人，`note` 必填
3. **AI 校验**：`method: "ai"`, `confidence: high/medium/low`，不得使用 `absolute`
4. **未校验**：不在 map 中的条目默认 `unreviewed`
5. **豁免范围**：human verification 可豁免历史解释类异常（rulerOutOfPolity、eraOutOfPolity、yearGaps），但结构性硬错误不可豁免：重复 id、JSON 结构错误、必填字段缺失、polityId 引用不存在、年份非整数、startYear > endYear
6. **AI 不得覆盖人工**：已有 `method: "human"` 或 `"error"` 的记录，AI 不可修改
7. **key 格式**：`{类型}:{实体 id}`，如 `ruler:rn-秦朝-始皇帝`、`era:era-至元-元-2`

---

## 七、column 语义

年表的"列"对应 `mergeGroup`，而非单个 polityId。同组政权在年表中合为一列展示。`columnId = col-{mergeGroup}`。

### column 定义（column-map.json）

```json
{
  "columnId": "col-汉",
  "label": "汉",
  "mergeGroup": "汉",
  "members": ["pol-汉王", "pol-西汉", "pol-新朝", "pol-更始", "pol-东汉"],
  "isCentral": true,
  "isBorder": false,
  "period": "秦汉",
  "startYear": -206,
  "endYear": 220,
  "defaultVisible": true
}
```

### 列操作规则

| 操作 | 说明 |
|------|------|
| 隐藏 | 整列及所有 member 政权不显示 |
| 固定 | 最多 3 列，始终显示在最左侧 |
| 手动排序 | 覆盖 sort-rules 的自然排序 |

- pinned 列被 hidden 时视为取消固定
- 搜索结果指向已隐藏列时，前端自动临时显示该列
- 列设置通过 `localStorage` 持久化

---

## 八、外置元数据文件

| 文件 | 内容 | 引用方式 |
|------|------|----------|
| `verification-map.json` | 人工/AI 校验记录 | `{type}:{id}` |
| `exception-map.json` | 合法历史异常 | `{type}:{id}` |
| `source-map.json` | 数据来源 | `{type}:{id}` |
| `column-map.json` | 列定义与配置 | columnId |
| `sort-rules.json` | 时期排序规则 | period |
| `event-taxonomy.json` | 事件类型枚举 | type 值 |
| `alias-map.json` | 批量别名增强 | `{type}:{id}` |
| `display-map.json` | 显示覆盖规则 | `{type}:{id}` |

---

## 九、字段归属原则

**保留在主 dict（历史事实）：** id、name、年份、关联关系（polityId、mergeGroup）、分类标签（isCentral、isBorder）、正文内容、人名地名、eraNames、countStartYear

**外置到 meta 文件（管理/校验/展示）：** 校验信息、来源信息、异常说明、展示配置、搜索增强、排序规则、分类枚举

---

## 十、数据库展示字段

缺失字段统一显示为 `"未补充"`。

### 政权

name（名称）、selfName（自称）、aliases（别名）、period（时期）、isCentral（类型）、isBorder（边疆）、startYear（起始年）、endYear（终止年）

### 君主

displayTitle（称号）、personalName（姓名）、templeTitle（庙号）、posthumousTitle（谥号）、aliases（别名）、polityId（所属政权）、reignStartYear（起始年）、reignEndYear（终止年）、personId（人物ID）、phaseType（阶段类型）

### 年号

name（年号）、aliases（别名）、polityId（所属政权）、startYear（起始年）、endYear（终止年）、countStartYear（纪年起算年）、continuityGroup（连续纪年组）

### 事件

title（标题）、text（简述）、year（年份）、level（级别）、type（类型）、relatedPolities（关联政权）、description（详细描述）
