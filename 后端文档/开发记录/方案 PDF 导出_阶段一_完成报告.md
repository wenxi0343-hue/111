# 方案 PDF 导出 — 阶段一完成报告

**切片（阶段）**：方案保存后具备可靠导出基础  
**完成时间**：2026-07-02 18:05  
**切片完成标准**：用户只能确认保存达标且可生产的方案；系统能按历史记录编号读取完整快照，并能记录每次导出类型和导出时间。

---

## 完成的任务

| 任务 | 测试 | 验收方式 | 状态 |
|------|------|---------|------|
| Task-01: 导出前置与历史导出基础 | 70 项相关集成测试通过，类型检查通过 | TDD | 完成 |

---

## 文件变更

### 新增
- `src/modules/import-export/matching-scheme-pdf-types.ts` — 定义 PDF 导出类型和导出记录结构。
- `docs/开发记录/方案 PDF 导出_阶段一_完成报告.md` — 记录阶段完成情况。

### 修改
- `src/server/actions/matching-actions.ts` — 保存前拦截未达标、不可生产和数据不足方案；重算结果按最终状态返回 `canSave`。
- `src/server/actions/matching-scheme-history.ts` — 新增按 ID 读取完整历史、追加导出记录、摘要带出导出记录。
- `src/modules/scheme-adjustment/types.ts` — 将 `canSave` 调整为布尔值。
- `src/app/(main)/matching/_components/box-spec-form.tsx` — 页面按 `canSave` 禁用确认保存，并保留服务端提示兜底。
- `tests/integration/matching/matching-actions.test.ts` — 覆盖保存前置规则。
- `tests/integration/matching/matching-scheme-history.test.ts` — 覆盖历史读取、导出记录追加和安全失败。
- `tests/integration/matching/matching-page.test.tsx` — 覆盖未达标/不可生产时确认保存不可用。
- `specs/features/方案 PDF 导出_任务规划.md` — 标记 Task-01 完成并勾选验收项。

---

## 验证结果

| 检查项 | 结果 |
|--------|------|
| `pnpm vitest run tests/integration/matching/matching-actions.test.ts tests/integration/matching/matching-scheme-history.test.ts tests/integration/matching/matching-page.test.tsx` | 通过，3 个文件 70 项测试 |
| `pnpm typecheck` | 通过 |
| 浏览器轻量验证 | 本地 `/matching` 页面可访问，输入控件可操作；风险禁用主逻辑由集成测试覆盖 |

---

## AC 覆盖进度

| AC 编号 | 状态 | 说明 |
|---------|------|------|
| AC-005 | 已满足 | 未保存成功前不暴露导出入口；保存只允许达标可生产方案。 |
| AC-007 | 已满足 | 未达标、不可生产、数据不足方案无法确认保存。 |
| AC-008 | 已满足 | 历史记录可按 ID 读取完整快照，供后续导出复用。 |
| AC-011 | 已满足 | 导出记录类型和追加能力已具备，失败时返回安全业务错误。 |
| AC-015 | 部分满足 | 历史摘要已带出导出记录；页面展示留到 Task-03。 |

---

## 问题与决策

### 导出记录复用现有 JSONB 字段

**情况**：任务要求保留导出流水，但不新增导出文件表。  
**处理**：在历史仓储中新增 `appendExportRecord`，将 `full_report` 和 `summary_sheet` 记录追加到 `exportRecords`。  
**影响**：Task-02 生成 PDF 成功后可直接追加导出记录，Task-03 可读取摘要展示导出历史。

---

## 技术债务

- PDF 生成、下载路由和导出入口尚未实现，按任务规划留到 Task-02 和 Task-03。
