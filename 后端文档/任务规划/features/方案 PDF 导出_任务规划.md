# 方案 PDF 导出 — 开发任务计划

## 1. 任务概览

**总任务数**：4 个  
**预计总工时**：705 分钟（约 11.75 小时）  
**开发方法**：TDD — 每个任务按 RED → GREEN → REFACTOR 循环执行

**关键标注**：
- 🔒 阻塞任务：被多个任务依赖，建议优先完成
- ⚠️ 风险任务：业务规则容易写错，执行时需要重点核对 AC

### 合并说明

| 合并前 | 合并后 | 合并原因 |
|--------|--------|----------|
| 原 Task-01 + 原 Task-02 | 新 Task-01 | “哪些方案能保存/导出”和“如何读取历史并记录导出”强绑定，合并后先把导出前置和历史追溯基础一次定牢。 |
| 原 Task-03 + 原 Task-04 | 新 Task-02 | 完整报告和精简方案表共用导出数据模型、HTML 模板、PDF 路由和导出记录逻辑，合并可减少重复改同一批文件。 |
| 原 Task-05 | 新 Task-03 | 页面入口和导出记录展示是独立用户可见切片，保留单独验证。 |
| 原 Task-06 | 新 Task-04 | 失败处理、中文排版和成本泄露检查属于质量兜底，保留单独验证，避免边界被主流程淹没。 |

### 依赖关系图

```mermaid
graph LR
    T01["Task-01 导出前置与历史导出基础 🔒⚠️"] --> T02["Task-02 完整报告与精简方案表 PDF 生成 🔒⚠️"]
    T02 --> T03["Task-03 页面导出入口与导出记录展示"]
    T03 --> T04["Task-04 失败处理与中文排版回归 ⚠️"]

    classDef blocker fill:#ffd6d6,stroke:#d33,stroke-width:2px
    classDef risky fill:#ffe8c2,stroke:#d9822b,stroke-width:2px
    class T01,T02 blocker
    class T01,T02,T04 risky
```

### 可并行任务组

| 并行组 | 任务 | 说明 |
|--------|------|------|
| A | Task-04 中的错误分支验证、中文长文本验证 | 都依赖 Task-03 完成，但具体测试补充可以分开推进。 |

---

## 2. 开发任务

> 每个任务按 TDD 循环执行：RED（根据验证标准写测试）→ GREEN（写最小实现通过测试）→ REFACTOR（重构）。测试不是独立任务。

### 阶段一：方案保存后具备可靠导出基础

**阶段完成标准**：用户只能确认保存达标且可生产的方案；系统能按历史记录编号读取完整快照，并能记录每次导出类型和导出时间。

---

#### Task-01: 导出前置与历史导出基础 🔒⚠️

**通俗解释**：系统先把“什么方案能导出”管住，再准备好按记录编号找到方案和记下导出流水。

**做什么**：调整 `saveConfirmedMatchingScheme` 和页面保存状态，只允许 `qualified` 最终方案确认保存；待重新校核、未达标、不可生产、数据不足状态均不能保存；扩展历史方案仓储契约，新增 `findById` 和 `appendExportRecord`；定义 `MatchingSchemePdfExportType` 与 `MatchingSchemeExportRecord`；追加导出记录时复用现有 `exportRecords` JSONB 字段，不新增导出文件表；读取历史摘要时带出导出记录供页面展示。

**涉及文件**：`src/server/actions/matching-actions.ts`、`src/server/actions/matching-scheme-history.ts`、`src/modules/import-export/matching-scheme-pdf-types.ts`、`src/app/(main)/matching/_components/box-spec-form.tsx`、`tests/integration/matching/matching-actions.test.ts`、`tests/integration/matching/matching-page.test.tsx`、`tests/integration/matching/matching-scheme-history.test.ts`

**参考**：技术方案 3、4.2、5.2、5.6、6、7.4、9.2、10 → AC-005, AC-007, AC-008, AC-011, AC-015

**依赖**：无

**预估工时**：210 分钟

**状态**：已完成（2026-07-02）

**验证标准**（TDD RED 阶段直接转化为测试用例）：
- [x] 传入 `clientState = "dirty"` 调用保存 → 返回 `VALIDATION_ERROR`，message 为“请先重新校核后再保存”，历史记录不新增。
- [x] 服务端重新校核得到 `finalStatus = "qualified"` → 保存成功并返回非空 `schemeId`。
- [x] 服务端重新校核得到 `finalStatus = "unqualified"` → 保存失败，返回 `VALIDATION_ERROR` 和“当前方案未达标或不可生产，无法确认保存”，历史记录不新增。
- [x] 服务端重新校核得到 `finalStatus = "not_manufacturable"` → 保存失败，历史记录不新增。
- [x] 服务端重新校核得到 `finalStatus = "data_incomplete"` → 保存失败，历史记录不新增。
- [x] 页面重新校核后显示“未达标”或“不可生产” → “确认保存”按钮不可用或点击后展示无法保存提示。
- [x] 当前方案尚未保存成功时 → 页面不显示“完整报告 PDF”和“精简方案表 PDF”导出入口。
- [x] 已存在历史记录 `scheme-1` → 调用 `findById("scheme-1")` 返回完整历史快照，包含 `boxSpecSnapshot`、`originalRecommendationSlotsSnapshot`、`finalSchemeSnapshot`、`exportRecords`。
- [x] 查询不存在的历史记录 id → `findById` 返回 `null`。
- [x] 对 `scheme-1` 追加 `{ type: "full_report", exportedAt: "2026-07-02T10:30:00.000Z" }` → 再次读取时 `exportRecords` 包含该记录。
- [x] 对同一历史记录连续追加 `full_report` 和 `summary_sheet` → `exportRecords` 保留两条记录且顺序与追加时间一致。
- [x] 追加导出记录时数据库更新失败 → 返回安全业务错误，不包含 SQL、连接串或堆栈。
- [x] 历史摘要读取结果包含导出记录数量或导出记录列表，供页面展示使用。

---

### 阶段二：用户可以下载两种 PDF

**阶段完成标准**：用户在已保存方案上可以下载完整配纸报告和精简方案表；完整报告保留成本，精简方案表不展示内部成本；两种导出都会留下导出记录。

---

#### Task-02: 完整报告与精简方案表 PDF 生成 🔒⚠️

**通俗解释**：用户保存方案后，可以下载内部完整报告，也可以下载不含成本的客户版方案表。

**做什么**：实现完整报告和精简方案表共用的导出数据构建、HTML 渲染、Playwright PDF 生成和下载 API Route；路由按 `schemeId` 读取历史快照，校验登录和 `finalStatus = "qualified"`；通过 `type = "full_report"` 或 `type = "summary_sheet"` 控制抬头、文件名、原始推荐对比和成本展示；PDF 生成成功后追加对应导出记录。

**涉及文件**：`src/modules/import-export/build-matching-scheme-pdf-data.ts`、`src/modules/import-export/render-matching-scheme-pdf-html.ts`、`src/modules/import-export/generate-matching-scheme-pdf.ts`、`src/app/api/exports/matching-schemes/[schemeId]/route.ts`、`tests/unit/import-export/matching-scheme-pdf-data.test.ts`、`tests/integration/import-export/matching-scheme-pdf-route.test.ts`

**参考**：技术方案 4.1、4.2、4.3、4.4、5.1、5.3、5.4、5.5、5.6、7.1、7.2、7.3、8、10 → AC-001, AC-002, AC-003, AC-004, AC-005, AC-009, AC-011, AC-012, AC-013, AC-014

**依赖**：Task-01

**预估工时**：285 分钟

**状态**：已完成（2026-07-02）

**验证标准**（TDD RED 阶段直接转化为测试用例）：
- [x] 传入 `type = "full_report"` 和一条 `qualified` 历史方案 → 导出数据 `title = "配纸方案报告"`。
- [x] 完整报告导出数据包含输入参数、原始三套推荐对比、最终确认方案、强度校核、成本和推荐结论。
- [x] 完整报告导出数据中 `exportVisibility.showCost = true`，`exportVisibility.showOriginalRecommendations = true`。
- [x] 完整报告 HTML 包含“配纸方案报告”“原始三套推荐”“单箱含税成本”“强度校核”等文本。
- [x] 传入 `type = "summary_sheet"` 和一条 `qualified` 历史方案 → 导出数据 `title = "配纸方案表"`。
- [x] 精简方案表导出数据包含最终确认方案、方案配置、空箱抗压、边压、耐破、达标状态、可生产状态和推荐结论。
- [x] 精简方案表导出数据中 `exportVisibility.showCost = false`，`exportVisibility.showOriginalRecommendations = false`。
- [x] 精简方案表导出数据序列化后不包含 `taxIncludedCostYuan`、`layerUnitPrices`、`paperCostYuan`、`processingFeeYuan`、`taxYuan`。
- [x] 精简方案表 HTML 不包含“单箱含税成本”“各层单价”“用纸总价”“加工费用”“税金”。
- [x] 请求 `GET /api/exports/matching-schemes/{schemeId}?type=full_report` 且已登录 → 返回 `Content-Type = application/pdf`。
- [x] 请求 `GET /api/exports/matching-schemes/{schemeId}?type=summary_sheet` 且已登录 → 返回 `Content-Type = application/pdf`。
- [x] 完整报告响应的 `Content-Disposition` 文件名包含“配纸方案”、保存时间和“完整报告”。
- [x] 精简方案表响应的 `Content-Disposition` 文件名包含“配纸方案”、保存时间和“精简方案表”。
- [x] 完整报告 PDF 生成成功后 → 历史记录新增一条 `type = "full_report"` 的导出记录。
- [x] 精简方案表 PDF 生成成功后 → 历史记录新增一条 `type = "summary_sheet"` 的导出记录。
- [x] 历史方案不存在 → 路由返回 404 和“方案记录不存在”。
- [x] 历史方案 `finalStatus !== "qualified"` → 路由返回 409 和“当前方案不可导出”。
- [x] 未登录访问导出路由 → 返回 401，不生成 PDF，不追加导出记录。

---

### 阶段三：用户能在当前结果页和历史页操作导出

**阶段完成标准**：当前结果页保存成功后显示两个导出入口；历史方案页也能导出，并能看到该方案过去导出过哪些 PDF。

---

#### Task-03: 页面导出入口与导出记录展示

**通俗解释**：用户不用记链接，保存后或进入历史记录时都能直接点按钮下载 PDF，也能看到之前导出过什么。

**做什么**：在当前结果页保存成功摘要中加入“完整报告 PDF”“精简方案表 PDF”下载入口；未保存、待重新校核、保存失败时不显示入口；在历史方案页为已保存记录展示两个导出入口和导出记录；页面只用历史记录 ID 拼接下载链接，不在前端生成 PDF。

**涉及文件**：`src/app/(main)/matching/_components/box-spec-form.tsx`、`src/app/(main)/matching/matching.module.css`、`src/app/(main)/history/page.tsx`、`src/app/(main)/history/history.module.css`、`tests/integration/matching/matching-page.test.tsx`

**参考**：技术方案 2、5.1、5.6、6、8、10 → AC-001, AC-002, AC-005, AC-006, AC-007, AC-015

**依赖**：Task-02

**预估工时**：120 分钟

**状态**：已完成（2026-07-02）

**验证标准**（TDD RED 阶段直接转化为测试用例）：
- [x] 当前结果页保存成功，响应包含 `schemeId = "scheme-1"` → 页面显示“完整报告 PDF”和“精简方案表 PDF”两个下载入口。
- [x] 当前结果页尚未确认保存 → 页面不显示 PDF 下载入口。
- [x] 当前方案处于“待重新校核” → 页面不显示 PDF 下载入口。
- [x] 保存动作失败 → 页面保留当前结果并不显示 PDF 下载入口。
- [x] 当前结果页完整报告入口链接为 `/api/exports/matching-schemes/scheme-1?type=full_report`。
- [x] 当前结果页精简方案表入口链接为 `/api/exports/matching-schemes/scheme-1?type=summary_sheet`。
- [x] 历史方案页展示一条已保存方案 → 该记录区域显示两个 PDF 下载入口。
- [x] 历史方案存在两条导出记录 → 页面按时间展示“完整报告”和“精简方案表”的导出时间。
- [x] 页面导出入口使用按钮或链接文案，不只依赖图标或颜色表达。

---

### 阶段四：导出失败和中文排版质量达标

**阶段完成标准**：PDF 生成失败时用户看到安全提示；长中文和表格字段在 PDF/HTML 中不被截断，关键内容可读。

---

#### Task-04: 失败处理与中文排版回归 ⚠️

**通俗解释**：导出出问题时，用户看到的是清楚的业务提示；内容很长时，PDF 仍然能读。

**做什么**：补充 PDF 生成失败、导出记录写入失败、非法导出类型等异常测试；统一错误响应；补充长中文字段、长纸张名称、长选型理由的 HTML/PDF 生成验证；检查精简方案表仍不泄露成本；确认页面和服务端错误不暴露堆栈、路径、SQL 或敏感价格明细。

**涉及文件**：`src/app/api/exports/matching-schemes/[schemeId]/route.ts`、`src/modules/import-export/render-matching-scheme-pdf-html.ts`、`src/modules/import-export/generate-matching-scheme-pdf.ts`、`tests/unit/import-export/matching-scheme-pdf-data.test.ts`、`tests/integration/import-export/matching-scheme-pdf-route.test.ts`

**参考**：技术方案 5.5、8、9、10 → AC-009, AC-010, AC-013, AC-014

**依赖**：Task-03

**预估工时**：90 分钟

**状态**：已完成（2026-07-02）

**验证标准**（TDD RED 阶段直接转化为测试用例）：
- [x] 请求导出时 `type = "unknown"` → 返回 400 和“导出类型无效”，不生成 PDF，不追加导出记录。
- [x] PDF 生成函数抛出包含本地路径或堆栈的错误 → 路由返回 500 和“导出失败，请稍后重试”，响应不包含路径、堆栈或内部错误。
- [x] 导出记录写入失败 → 路由返回 500，不返回成功 PDF 下载响应。
- [x] HTML 模板中表格单元格样式包含 `overflow-wrap` 或等效自动换行规则。
- [x] 历史快照中纸张名称超过 40 个中文字符 → 完整报告 HTML 中该名称完整出现。
- [x] 选型理由超过 100 个中文字符 → 完整报告 HTML 中该理由完整出现。
- [x] 精简方案表使用长中文字段生成 HTML → 不包含成本字段，且最终方案、强度和推荐结论完整出现。
- [x] 完整报告和精简方案表都包含对应抬头：“配纸方案报告”或“配纸方案表”。

---

## 3. AC 覆盖矩阵

| AC | 覆盖任务 |
|----|----------|
| AC-001 | Task-02, Task-03 |
| AC-002 | Task-02, Task-03 |
| AC-003 | Task-02 |
| AC-004 | Task-02 |
| AC-005 | Task-01, Task-02, Task-03 |
| AC-006 | Task-01, Task-03 |
| AC-007 | Task-01, Task-03 |
| AC-008 | Task-01, Task-02 |
| AC-009 | Task-02, Task-04 |
| AC-010 | Task-02, Task-04 |
| AC-011 | Task-01, Task-02 |
| AC-012 | Task-02 |
| AC-013 | Task-02, Task-04 |
| AC-014 | Task-02, Task-04 |
| AC-015 | Task-01, Task-02, Task-03 |

---

## 4. 验证计划

| 检查项 | 关联任务 | 关联 AC |
|--------|----------|---------|
| 运行 matching actions 集成测试，确认未达标、不可生产、数据不足方案不能保存 | Task-01 | AC-007, AC-008, AC-011 |
| 运行历史方案集成测试，确认按 ID 读取和追加导出记录可用 | Task-01 | AC-005, AC-011, AC-015 |
| 运行 import-export 单元测试，确认完整报告包含成本和原始三套推荐 | Task-02 | AC-003, AC-012, AC-014 |
| 运行 import-export 单元测试，确认精简方案表过滤所有内部成本字段 | Task-02 | AC-004, AC-013 |
| 运行 PDF 路由集成测试，确认完整报告和精简方案表均能返回 PDF 并追加记录 | Task-02 | AC-001, AC-002, AC-005, AC-009 |
| 运行 matching page 集成测试，确认保存成功后显示导出入口，未保存或待重新校核时不显示 | Task-03 | AC-001, AC-006, AC-007 |
| 运行历史页集成测试，确认导出入口和多次导出记录可见 | Task-03 | AC-002, AC-005, AC-015 |
| 运行中文长文本与错误分支测试，确认不截断关键内容且错误不泄露内部信息 | Task-04 | AC-009, AC-010, AC-013, AC-014 |

建议命令：

```bash
pnpm vitest run tests/unit/import-export tests/integration/import-export tests/integration/matching
```

---

## 5. Mock 闭环检查

本功能不引入新的外部 Mock 接口。测试中可使用内存历史方案仓储、模拟 PDF 生成函数和固定历史快照；这些替身只服务于 TDD，不需要额外接口对接任务。

需要注意：如果实现时发现生产环境无法直接使用当前 `@playwright/test` 作为运行时 PDF 生成依赖，应在 Task-02 中把运行时依赖调整为可部署的 Playwright/Chromium 方案，并同步更新依赖和验证；这不是 Mock 对接任务，而是运行时依赖落地任务。

---

## 附录：变更记录

| 日期 | 变更内容 | 原因 |
|------|---------|------|
| 2026-07-02 | 初始版本 | 基于《方案 PDF 导出》和《方案 PDF 导出_技术方案》拆解 TDD 开发任务 |
| 2026-07-02 | 合并为 4 个任务 | 合并导出前置与历史基础、完整报告与精简方案表 PDF 生成，减少重复修改并保留 AC 覆盖 |
