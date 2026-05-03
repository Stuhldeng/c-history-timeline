# 数据字段规范

> 版本：v0.7 | 最后更新：2026-05-03

本文件定义 `dict/` 目录下四类核心数据文件（polity / ruler / era / event）的字段规范。所有字段分三级：

- **required** — 必须存在且非空，缺失导致构建失败
- **optional** — 可存在，可为 null / 空字符串 / 空数组
- **reserved** — 已定义但尚未填充数据，为后续版本预留

每字段标注其领域归属：

- **fact** — 历史事实，保留在主 dict
- **display** — 影响展示方式
- **search** — 仅用于搜索匹配
- **meta** — 管理元数据（后续应外置到对应 meta 文件）

---

## 一、通用规则

### 年份

- 公元前用**负整数**表示（如 `-841` = 公元前 841 年）
- 公元后用**正整数**表示（如 `1644`）
- **无公元 0 年**：前 1 年的下一年直接是 1 年
- 年份字段必须为**整数**，不接受字符串

### ID 规则

| 类型 | 格式 | 示例 | 说明 |
|------|------|------|------|
| polity | `pol-{史称}` | `pol-秦朝`, `pol-马楚` | 用史称，避免同名冲突 |
| ruler | `rn-{政权名}-{称呼}` | `rn-秦朝-始皇帝` | 政权名取 polity.id 的 pol- 后缀 |
| era | `era-{年号名}[-{政权名}]` | `era-建元-西汉`, `era-共和` | 同年号多政权时加政权名后缀 |
| event | `evt-{year}{BC/AD}-{序号}` | `evt-841BC-01`, `evt-220-01` | BC 年加 BC 后缀，AD 年不加 |

- id 必须在同类型内**全局唯一**（结构性硬约束，重复导致构建失败）
- 已有 id **不可更改**（会破坏 chronology 引用和 review 标注）
- 如需表达同一实体的其他称呼，用 `aliases` 字段

---

## 二、polity-map.json

### 顶层结构

```json
{
  "_meta": { "name": "polity-map", "version": "0.6.0", ... },
  "polities": [ ... ]
}
```

`_meta` 属于构建管理元数据，后续应迁移到独立配置。

### polity 条目

| 字段 | 级别 | 类型 | 领域 | 说明 |
|------|------|------|------|------|
| `id` | required | string | fact | `pol-{史称}`，如 `pol-西汉` |
| `name` | required | string | fact | 通用政权名，如 `西汉` |
| `startYear` | required | integer | fact | 政权起始年 |
| `endYear` | required | integer | fact | 政权结束年 |
| `mergeGroup` | required | string | fact | 列归并组名，同组政权同列显示 |
| `isCentral` | required | boolean | fact | 是否中央王朝 |
| `isBorder` | required | boolean | fact | 是否边疆政权 |
| `period` | required | string | meta | 所属时期，用于数据库筛选。必须是下列枚举之一，不可新增时期 |

**时期枚举（6 个）：**

| 值 | 涵盖范围 |
|----|----------|
| `先秦` | 西周共和元年（-841）前至秦统一（-221）前 |
| `秦汉` | 秦统一（-221）至东汉亡（220） |
| `魏晋南北朝` | 三国（220）至隋建（581）前 |
| `隋唐五代` | 隋建（581）至北宋建（960）前 |
| `宋辽金` | 北宋建（960）至元建（1271）前 |
| `元明清` | 元建（1271）至清亡（1911） |

| `selfName` | optional | string | fact | 自称国号，如周的 `selfName: "周"` |
| `aliases` | optional | string[] | search | 政权别名（搜索匹配用） |
| `durationRaw` | optional | string | meta | 存续时间原文表述，仅供人工参考 |

### 排序规则（_meta.sortRules）

```json
{
  "periodName": "先秦战国前",
  "yearStart": -841,
  "yearEnd": -454,
  "priority": { "周": 1, "鲁": 2, ... }
}
```

`sortRules` 后续应迁移到 `dict/sort-rules.json`。

---

## 三、ruler-map.json

### ruler 条目

| 字段 | 级别 | 类型 | 领域 | 说明 |
|------|------|------|------|------|
| `id` | required | string | fact | `rn-{政权名}-{称呼}` |
| `polityId` | required | string | fact | 所属政权 id，必须存在于 polity-map |
| `reignStartYear` | required | integer | fact | 在位起始年 |
| `reignEndYear` | required | integer | fact | 在位结束年 |
| `displayTitle` | required | string | display | 显示名，详见下方填充规则 |
| `searchLabels` | required | string[] | search | 搜索用标签（政权+称号+姓名组合） |
| `uncertain` | required | boolean | meta | 数据是否存疑 |

| `personalName` | optional | string | fact | 本人姓名，如 `嬴政`。无法考证时可省略 |
| `posthumousTitle` | optional | string | fact | 谥号，如 `汉武帝` |
| `templeTitle` | optional | string | fact | 庙号，如 `唐太宗` |
| `aliases` | optional | string[] | search | 别名列表（搜索匹配用） |
| `eraNames` | optional | string[] | fact | 该君主使用的年号名列表（不完整） |

### displayTitle 填充规则

`displayTitle` 必须非空。v0.7 构建时对缺失值按以下优先级自动生成：

1. 若 `posthumousTitle` 非空 → 使用谥号（如 `汉武帝`）
2. 若 `templeTitle` 非空 → 使用庙号（如 `唐太宗`）
3. 若 `personalName` 非空：
   - 边疆政权（`isBorder: true`）→ 直接使用姓名（如 `铁木真`）
   - 其他情况 → **政权名 + 姓名**（如 `秦嬴政`）
4. 若以上皆空 → 使用 id 中 `rn-{政权名}-` 之后的部分作为兜底

注意：以上仅为自动填充规则。人工审核后可覆盖为更合适的显示名。

### 后续版本预留字段（跨政权君主连续模型）

以下字段 v0.7 为特殊情况（嬴政、刘邦、忽必烈等）增加：

| 字段 | 级别 | 类型 | 说明 |
|------|------|------|------|
| `personId` | optional | string | 跨政权人物统一标识，如 `person-嬴政` |
| `continuityGroup` | optional | string | 连续纪年组标识 |
| `phaseType` | optional | string | 阶段类型枚举：`founder-transition` / `restoration` / `polity-renaming` |
| `regnalCountStartYear` | optional | integer | 纪年起算年（用于跨政权连续纪年） |

---

## 四、era-map.json

### era 条目

| 字段 | 级别 | 类型 | 领域 | 说明 |
|------|------|------|------|------|
| `id` | required | string | fact | `era-{年号名}[-{政权名}]` |
| `name` | required | string | fact | 年号名，如 `建元` |
| `polityId` | required | string | fact | 所属政权 id |
| `startYear` | required | integer | fact | 年号起始年 |
| `endYear` | required | integer | fact | 年号结束年 |
| `searchLabels` | required | string[] | search | 搜索用标签 |

| `aliases` | optional | string[] | search | 年号别名，当前全部为空，为后续预留 |

### 后续版本预留字段（跨政权年号连续模型）

| 字段 | 级别 | 类型 | 说明 |
|------|------|------|------|
| `continuityGroup` | optional | string | 连续纪年组标识（如 `era-至元-忽必烈`） |
| `phaseType` | optional | string | 阶段类型：`cross-polity` / `restoration` |
| `countStartYear` | optional | integer | 纪年起算年（用于跨政权连续纪年） |

---

## 五、event-map.json

### event 条目

| 字段 | 级别 | 类型 | 领域 | 说明 |
|------|------|------|------|------|
| `id` | required | string | fact | `evt-{year}{BC/AD}-{序号}` |
| `year` | required | integer | fact | 事件发生年 |
| `title` | required | string | fact | 事件标题（简短，用于表格列和搜索摘要） |
| `text` | required | string | fact | 事件文本（年表中显示的简短文本） |
| `level` | required | string | meta | `major`（年表显示）/ `minor`（仅数据库可查） |

| `type` | optional | string | meta | 事件类型，v0.7 定义枚举，v0.9 前补全 |
| `relatedPolities` | optional | string[] | fact | 关联政权 id 列表 |
| `description` | optional | string | fact | 详细描述（用于悬浮卡和数据库详情） |
| `aliases` | optional | string[] | search | 搜索别名 |

### 事件类型枚举（v0.7 预定义）

| 值 | 含义 |
|----|------|
| `political` | 政治（政权更迭、禅让、制度变革、宫廷政变） |
| `military` | 军事（战争、战役、叛乱） |
| `succession` | 继位（同一政权内的君主继位） |
| `diplomacy` | 外交（和亲、会盟、朝贡） |
| `economy` | 经济（赋税、货币、农业） |
| `culture` | 文化（典籍、科举、宗教） |
| `disaster` | 灾害（地震、饥荒、瘟疫） |
| `institution` | 建制（设郡县、建都、设官制） |

此枚举后续写入 `dict/event-taxonomy.json`。

---

## 六、verification-map.json（v0.7 新增）

### 顶层结构

```json
{
  "_meta": {
    "name": "verification-map",
    "version": "0.7.0",
    "description": "人工/AI 校验结果",
    "rules": { ... },
    "keyFormat": "{type}:{id}",
    "types": ["polity", "ruler", "era", "event"]
  },
  "items": {
    "ruler:rn-秦朝-始皇帝": { ... }
  }
}
```

### item 条目

| 字段 | 级别 | 类型 | 说明 |
|------|------|------|------|
| `method` | required | string | `human` 或 `ai` |
| `confidence` | required | string | human → 仅 `absolute`；ai → `high` / `medium` / `low` |
| `verifiedBy` | required | string | 校验者标识（人工填人名，AI 填模型名） |
| `verifiedAt` | required | string | 校验日期，ISO 格式（如 `2026-05-03`） |
| `note` | required | string | 校验说明 |
| `appliesTo` | optional | string | 关联的 validation 问题类别（如 `rulerOutOfPolity`） |

### 校验规则

1. **人工校验**：`method: "human"`, `confidence: "absolute"`。仅限用户本人标记，AI 不得使用。
2. **AI 校验**：`method: "ai"`, `confidence: "high" | "medium" | "low"`。AI 不得使用 `absolute`。
3. **未校验**：不在 verification-map 中的条目默认为 `unreviewed`。
4. **豁免范围**：human verification 可豁免历史解释类异常（rulerOutOfPolity、eraOutOfPolity、yearGaps），使其不导致构建失败。但**结构性硬错误不可豁免**：
   - 重复 id
   - JSON 结构错误
   - 必填字段缺失
   - polityId 引用不存在
   - 年份非整数
   - `startYear > endYear`
5. **AI 不得覆盖人工**：若某 key 已有 `method: "human"` 记录，AI 不可修改。
6. **key 格式**：`{类型}:{实体 id}`，如 `ruler:rn-秦朝-始皇帝`、`era:era-至元-yuan`、`polity:pol-唐朝`。

---

## 七、column 语义

### 核心概念

年表的"列"对应 `mergeGroup`，而非单个 `polityId`。原因是部分政权在历史上是同一个政权的不同阶段（如西汉+新朝+更始+东汉共属 `汉`，北宋+南宋共属 `两宋`），在年表中应合为一列展示。

```
columnId = col-{mergeGroup}
```

### column 定义

每列由 `dict/column-map.json` 定义：

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

| 操作 | 作用对象 | 说明 |
|------|---------|------|
| 隐藏 | columnId | 整列及其所有 member 政权不显示 |
| 固定 | columnId | 最多 3 列，始终显示在表格最左侧 |
| 手动排序 | columnId | 覆盖 sort-rules 的自然排序 |

- **冲突处理**：pinned 列被 hidden 时，视为取消固定而非隐藏。即 `pinnedColumnIds` 和 `hiddenColumnIds` 不应有交集。
- **搜索跳转**：若搜索结果指向的政权所在列已被隐藏，前端应自动临时显示该列，持续到下次用户手动调整列设置。
- **状态持久化**：`hiddenColumnIds`、`pinnedColumnIds`、`manualOrder` 应通过 `localStorage` 持久化。

### 列标签

- 列的展示名称为 `label`，通常等于 `mergeGroup`
- **多成员列**：表头 tooltip 应列出所有成员政权及其存续年份
- **中央王朝**（`isCentral: true`）：在 UI 中可加视觉标识（如星标或加粗）
- **边疆政权**（`isBorder: true`）：在 UI 中可用不同色调标识

### 列排序

列的默认显示顺序由 `sort-rules.json` 控制（按时期选取活跃规则）。规则未覆盖的列按 `startYear` 升序排列。手动排序（`manualOrder`）覆盖自然排序。

---

## 八、外置元数据文件规划

以下字段应从主 dict 中**迁出**或**不新增**到主 dict，放入独立外置文件：

| 外置文件 | 内容 | 引用方式 |
|----------|------|----------|
| `verification-map.json` | 人工/AI 校验记录 | `{type}:{id}`，如 `ruler:rn-秦朝-始皇帝` |
| `exception-map.json` | 合法历史异常 | 同上 |
| `source-map.json` | 数据来源 | 同上 |
| `column-map.json` | columnId、列成员、默认配置 | columnId |
| `sort-rules.json` | 时期排序规则（从 polity-map._meta 迁出） | period |
| `event-taxonomy.json` | 事件类型枚举 | type 值 |
| `alias-map.json` | 批量别名增强 | `{type}:{id}` |
| `display-map.json` | 显示覆盖、tooltip 展示规则 | `{type}:{id}` |

当前 `polity-map._meta.sortRules` 将在 v0.7 后续任务中迁移到 `sort-rules.json`。

---

## 九、字段归属判定原则

### 保留在主 dict（历史事实核心字段）

- 实体标识：id、name
- 时间信息：startYear、endYear、reignStartYear、reignEndYear、year
- 关联关系：polityId、mergeGroup、relatedPolities
- 分类标签：isCentral、isBorder、level
- 正文内容：title、text、description
- 人名地名：personalName、templeTitle、posthumousTitle、selfName
- 跨政权字段（后续）：personId、continuityGroup、phaseType、countStartYear

### 外置到 meta 文件（管理/校验/展示元数据）

- 校验信息：method、confidence、verifiedBy、verifiedAt、note
- 来源信息：source、sourceUrl
- 异常说明：exceptionType、reason
- 展示配置：displayTitle 覆盖、tooltip 字段顺序、列配置
- 搜索增强：aliases 批量补充
- 排序规则：sortRules 完整规则
- 分类枚举：event type taxonomy
