# AI 选型理由与模板降级 — 阶段五 Task-06 完成报告

**切片（阶段）**：保存历史并让导出复用理由  
**完成时间**：2026-07-04 09:58  
**切片完成标准**：用户确认保存后，历史快照包含最终方案理由和来源；PDF 导出使用保存的理由，旧快照缺少理由时仅用模板补齐，不二次调用 AI。

---

## 完成的任务

| 任务 | 测试 | 验收方式 | 状态 |
|------|------|---------|------|
| Task-06: 保存历史并让导出复用理由 | 历史快照、保存动作、PDF 数据/路由测试 64 个通过 | TDD | 完成 |

---

## 文件变更

### 修改

- `src/modules/scheme-adjustment/types.ts` — `finalSchemeSnapshot` 支持保存 `selectionReason`。
- `src/modules/scheme-adjustment/create-history-snapshot.ts` — 将最终方案理由写入历史快照。
- `src/server/actions/matching-actions.ts` — 未调整保存复用所选推荐槽位理由；调整后保存基于服务端最新评估重新生成最终理由。
- `src/modules/import-export/build-matching-scheme-pdf-data.ts` — PDF 数据优先使用结构化 `selectionReason`；旧快照缺失时用确定性模板补齐。
- `tests/unit/scheme-adjustment/create-history-snapshot.test.ts` — 覆盖原始三套理由和最终理由保存。
- `tests/integration/matching/matching-actions.test.ts` — 覆盖未调整复用理由、调整后重新生成保存理由。
- `tests/unit/import-export/matching-scheme-pdf-data.test.ts` — 覆盖完整报告和精简方案表复用保存理由、旧快照模板补齐。
- `tests/integration/import-export/matching-scheme-pdf-route.test.ts` — 覆盖导出路由传递保存理由到 PDF 数据。
- `specs/features/AI 选型理由与模板降级_任务规划.md` — 标记 Task-06 完成。

---

## AC 覆盖进度

| AC 编号 | 状态 | 说明 |
|---------|------|------|
| AC-003 | 已满足 | 最终方案快照保存当前最终理由。 |
| AC-009 | 已满足 | 调整后保存理由基于服务端最新 `finalEvaluation` 生成。 |
| AC-010 | 已满足 | PDF 导出复用历史快照理由；旧快照用模板补齐，不接入 Provider。 |
| AC-011 | 已满足 | 理由仅进入快照和导出展示，不改变计算、状态或推荐排序。 |

---

## TDD 记录

- RED：新增历史快照、保存动作、PDF 数据和 PDF 路由测试，确认当前实现缺少最终 `selectionReason`、PDF 不识别结构化理由。
- GREEN：扩展 `createHistorySnapshot`，保存动作接入最终理由解析，PDF 数据构建支持结构化理由和旧快照模板补齐。
- REFACTOR：保持导出层只读快照，不新增 AI Provider 依赖；模板补齐只使用已有确定性模板函数。

---

## 验证结果

- `.\node_modules\.bin\vitest.cmd run tests/unit/scheme-adjustment/create-history-snapshot.test.ts tests/integration/matching/matching-actions.test.ts tests/unit/import-export/matching-scheme-pdf-data.test.ts tests/integration/import-export/matching-scheme-pdf-route.test.ts`：通过，4 个测试文件、64 个测试全部通过。
- `.\node_modules\.bin\vitest.cmd run tests/unit/ai-reasoning tests/integration/matching/ai-reasoning-cache.test.ts`：通过，5 个测试文件、37 个测试全部通过。
- `.\node_modules\.bin\vitest.cmd run tests/integration/matching/matching-page.test.tsx tests/integration/import-export/matching-scheme-pdf-route.test.ts tests/unit/import-export/matching-scheme-pdf-data.test.ts`：通过，3 个测试文件、50 个测试全部通过。
- `.\node_modules\.bin\tsc.cmd --noEmit`：通过。

---

## 问题与决策

### 旧快照缺少理由时只模板补齐

**情况**：历史中可能存在早期保存的快照，没有 `selectionReason`。  
**处理**：PDF 数据构建时从快照计算事实，调用确定性模板生成正文，不调用 AI Provider。  
**影响**：导出兼容旧数据，同时不会因为导出产生新的 AI 成本或不一致文案。

### 精简方案表保留来源可见性

**情况**：现有 PDF 数据结构只有 `recommendationConclusion` 字符串，没有单独来源字段。  
**处理**：结构化理由导出为“来源：正文”，例如“AI 生成：保存时的理由”。  
**影响**：不扩展 PDF 类型也能让完整报告和精简方案表都保留来源信息。

---

## 技术债务

无新增技术债务。
