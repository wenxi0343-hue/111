# 方案 PDF 导出 — 阶段二完成报告

**切片（阶段）**：用户可以下载两种 PDF  
**完成时间**：2026-07-02 18:30  
**切片完成标准**：用户在已保存方案上可以下载完整配纸报告和精简方案表；完整报告保留成本，精简方案表不展示内部成本；两种导出都会留下导出记录。

---

## 完成的任务

| 任务 | 测试 | 验收方式 | 状态 |
|------|------|---------|------|
| Task-02: 完整报告与精简方案表 PDF 生成 | 52 项相关测试通过，类型检查通过，PDF 样例渲染检查通过 | TDD + PDF 渲染抽检 | 完成 |

---

## 文件变更

### 新增
- `src/modules/import-export/build-matching-scheme-pdf-data.ts` — 从历史快照构建完整报告或精简方案表数据。
- `src/modules/import-export/render-matching-scheme-pdf-html.ts` — 生成中文 PDF HTML 模板和表格换行样式。
- `src/modules/import-export/generate-matching-scheme-pdf.ts` — 使用 Playwright/Chromium 生成 PDF Buffer。
- `src/app/api/exports/matching-schemes/[schemeId]/route.ts` — 提供 PDF 下载 API Route。
- `tests/unit/import-export/matching-scheme-pdf-data.test.ts` — 覆盖导出数据、HTML、成本过滤和文件名。
- `tests/integration/import-export/matching-scheme-pdf-route.test.ts` — 覆盖 PDF 响应、导出记录、认证和历史状态校验。
- `docs/开发记录/方案 PDF 导出_阶段二_完成报告.md` — 记录阶段完成情况。

### 修改
- `src/modules/import-export/matching-scheme-pdf-types.ts` — 扩展 PDF 导出数据模型、标签和类型校验。
- `specs/features/方案 PDF 导出_任务规划.md` — 标记 Task-02 完成并勾选验收项。

---

## 验证结果

| 检查项 | 结果 |
|--------|------|
| `pnpm vitest run tests/unit/import-export/matching-scheme-pdf-data.test.ts tests/integration/import-export/matching-scheme-pdf-route.test.ts tests/integration/matching/matching-scheme-history.test.ts tests/integration/matching/matching-actions.test.ts` | 通过，4 个文件 52 项测试 |
| `pnpm typecheck` | 通过 |
| PDF 样例生成 | 通过，Playwright 成功生成 2 页 A4 PDF |
| PDF 渲染检查 | 通过，Poppler 渲染 PNG 后确认长中文、表格、成本区和结论区可读、无重叠或截断 |

> 注：Poppler 渲染时输出了若干 `nameToUnicode` 字体映射警告，但 PNG 成功生成，视觉检查未发现中文显示异常。

---

## AC 覆盖进度

| AC 编号 | 状态 | 说明 |
|---------|------|------|
| AC-001 | 部分满足 | PDF 下载路由已支持当前页保存后按 `schemeId` 导出；页面入口留到 Task-03。 |
| AC-002 | 部分满足 | PDF 下载路由已支持历史记录 ID 导出；历史页入口留到 Task-03。 |
| AC-003 | 已满足 | 完整报告包含输入参数、原始三套推荐、最终方案、强度、成本和推荐结论。 |
| AC-004 | 已满足 | 精简方案表只保留最终方案、配置、强度、状态和推荐结论。 |
| AC-005 | 已满足 | PDF 生成成功后追加对应导出记录。 |
| AC-009 | 部分满足 | 路由已捕获生成/回写失败并返回安全错误；更细错误分支留到 Task-04。 |
| AC-011 | 已满足 | 路由只按已保存历史方案导出，并校验 `finalStatus = qualified`。 |
| AC-012 | 已满足 | 完整报告允许展示成本信息。 |
| AC-013 | 已满足 | 精简方案表数据和 HTML 均不展示内部成本字段。 |
| AC-014 | 已满足 | 抬头和文件名按导出类型、保存时间生成。 |
| AC-015 | 部分满足 | 导出记录已追加；页面展示留到 Task-03。 |

---

## 问题与决策

### 路由测试注入 PDF 生成器

**情况**：路由测试需要验证响应头、状态码和导出记录，但每次启动浏览器生成 PDF 会拖慢测试。  
**处理**：`createMatchingSchemePdfRouteHandler` 支持注入仓储和 PDF 生成函数；正式 `GET` 使用真实数据库仓储和 Playwright 生成器。  
**影响**：集成测试稳定快速，真实 PDF 生成通过单独渲染抽检覆盖。

### 精简方案表在数据层过滤成本

**情况**：只在 HTML 层隐藏成本容易遗漏字段或被后续模板误用。  
**处理**：`buildMatchingSchemePdfData` 在 `summary_sheet` 模式下不携带原始推荐和成本数组，测试检查序列化结果不包含内部成本字段名。  
**影响**：降低客户沟通版 PDF 泄露内部成本的风险。

---

## 技术债务

- 当前结果页和历史页的下载入口、导出记录展示尚未接入，按任务规划留到 Task-03。
- 非法导出类型、PDF 生成失败、导出记录写入失败的更细边界测试留到 Task-04 加强。
