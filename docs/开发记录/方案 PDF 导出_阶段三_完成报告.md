# 方案 PDF 导出 — 阶段三完成报告

**切片（阶段）**：用户能在当前结果页和历史页操作导出  
**完成时间**：2026-07-02 18:45  
**切片完成标准**：当前结果页保存成功后显示两个导出入口；历史方案页也能导出，并能看到该方案过去导出过哪些 PDF。

---

## 完成的任务

| 任务 | 测试 | 验收方式 | 状态 |
|------|------|---------|------|
| Task-03: 页面导出入口与导出记录展示 | 46 项相关测试通过，类型检查通过，历史页浏览器验收通过 | TDD + 浏览器验收 | 完成 |

---

## 文件变更

### 新增
- `tests/integration/matching/history-page.test.tsx` — 覆盖历史方案页 PDF 入口和导出记录展示。
- `docs/开发记录/方案 PDF 导出_阶段三_完成报告.md` — 记录阶段完成情况。

### 修改
- `src/app/(main)/matching/_components/box-spec-form.tsx` — 保存成功摘要中展示完整报告 PDF 和精简方案表 PDF 下载入口。
- `src/app/(main)/matching/matching.module.css` — 补充当前结果页导出入口样式。
- `src/app/(main)/history/page.tsx` — 历史方案卡片展示两个 PDF 下载入口和导出记录。
- `src/app/(main)/history/history.module.css` — 补充历史页导出入口和导出记录样式。
- `tests/integration/matching/matching-page.test.tsx` — 覆盖当前页保存成功、待重新校核、保存失败时的导出入口行为。
- `specs/features/方案 PDF 导出_任务规划.md` — 标记 Task-03 完成并勾选验收项。

---

## 验证结果

| 检查项 | 结果 |
|--------|------|
| `pnpm vitest run tests/integration/matching/matching-page.test.tsx tests/integration/matching/history-page.test.tsx tests/integration/import-export/matching-scheme-pdf-route.test.ts tests/integration/matching/matching-scheme-history.test.ts` | 通过，4 个文件 46 项测试 |
| `pnpm typecheck` | 通过 |
| 浏览器验收：打开 `http://127.0.0.1:3001/history` | 通过，真实历史页显示每条方案的“完整报告 PDF”和“精简方案表 PDF”入口 |

> 注：浏览器直接打开 PDF 下载链接时被本地浏览器拦截为 `ERR_BLOCKED_BY_CLIENT`，因此导出记录的真实点击回写未在浏览器中复验；该分支已由路由集成测试和历史页组件测试覆盖。

---

## AC 覆盖进度

| AC 编号 | 状态 | 说明 |
|---------|------|------|
| AC-001 | 已满足 | 当前结果页保存成功后展示两种 PDF 下载入口。 |
| AC-002 | 已满足 | 历史方案页每条可导出记录展示两种 PDF 下载入口。 |
| AC-005 | 已满足 | 历史页可展示导出记录类型和时间。 |
| AC-006 | 已满足 | 未保存、保存失败时当前页不展示 PDF 下载入口。 |
| AC-007 | 已满足 | 待重新校核状态不展示 PDF 下载入口。 |
| AC-015 | 已满足 | 历史页按时间展示完整报告和精简方案表导出记录。 |

---

## 问题与决策

### 页面只拼接下载链接

**情况**：PDF 生成已经由 Task-02 的 API Route 负责。  
**处理**：当前页和历史页只根据 `schemeId` 拼接 `/api/exports/matching-schemes/{schemeId}?type=...`。  
**影响**：前端不参与 PDF 生成，也不持有未保存的临时方案数据。

### 历史页只给达标记录展示导出入口

**情况**：当前保存规则已经禁止未达标/不可生产方案保存，但旧数据可能仍存在。  
**处理**：历史页仅在 `finalStatus = "qualified"` 时展示导出入口。  
**影响**：页面与导出路由的“只导出达标方案”规则保持一致。

---

## 技术债务

- PDF 下载被本地浏览器拦截时的用户提示不属于本阶段范围；失败处理和更细错误分支留到 Task-04。
