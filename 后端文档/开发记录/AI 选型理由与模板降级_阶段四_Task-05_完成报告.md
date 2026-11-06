# AI 选型理由与模板降级 — 阶段四 Task-05 完成报告

**切片（阶段）**：调整后重新校核展示新理由  
**完成时间**：2026-07-04 09:45  
**切片完成标准**：用户手动调整方案并完成重新校核后，页面展示基于调整后结果的新选型理由；再次调整后旧重新校核结果不再作为当前结果展示。

---

## 完成的任务

| 任务 | 测试 | 验收方式 | 状态 |
|------|------|---------|------|
| Task-05: 调整后重新校核展示新理由 | 匹配动作/页面测试 75 个通过，AI 理由相关测试 37 个通过 | TDD | 完成 |

---

## 文件变更

### 修改

- `src/modules/scheme-adjustment/types.ts` — `RecalculateAdjustedSchemeResult` 增加 `selectionReason`。
- `src/server/actions/matching-actions.ts` — `recalculateAdjustedScheme` 基于最新 `finalEvaluation` 生成调整后方案理由。
- `src/app/(main)/matching/_components/box-spec-form.tsx` — 重新校核结果区展示理由来源和正文。
- `tests/integration/matching/matching-actions.test.ts` — 覆盖调整后理由基于最新成本、AI 成功、Provider 失败、未达标/不可生产冲突降级。
- `tests/integration/matching/matching-page.test.tsx` — 覆盖重新校核结果展示新理由，以及再次调整后旧理由消失。
- `specs/features/AI 选型理由与模板降级_任务规划.md` — 标记 Task-05 完成。

---

## AC 覆盖进度

| AC 编号 | 状态 | 说明 |
|---------|------|------|
| AC-003 | 已满足 | 重新校核返回并展示基于调整后 `finalEvaluation` 的新理由，再次调整后清空旧结果。 |
| AC-006 | 已满足 | 未达标重新校核结果的模板理由包含“边压不足”，冲突 AI 被降级。 |
| AC-007 | 已满足 | 不可生产重新校核结果的模板理由包含“纸板宽超过设备限制”，冲突 AI 被降级。 |
| AC-008 | 已满足 | AI 文案与未达标/不可生产事实冲突时返回 `validation_failed` 模板理由。 |
| AC-009 | 已满足 | 调整后理由事实来自服务端最新评估结果，不读取客户端反写值。 |
| AC-010 | 已满足 | Provider 失败时重新校核动作仍返回 `ok: true` 并展示模板理由。 |
| AC-011 | 已满足 | 理由作为展示字段返回，不改变成本、强度、达标状态或可生产状态。 |
| AC-012 | 已满足 | 模板理由继续使用成本、强度、可生产状态和风险提示结构。 |

---

## TDD 记录

- RED：先新增匹配动作和页面集成测试，确认当前实现缺少 `selectionReason`，重新校核页面也不展示来源和正文。
- GREEN：扩展重新校核结果类型，在服务端基于最新 `finalEvaluation` 调用 `createSelectionReason`，页面复用已有 `SelectionReasonPanel`。
- REFACTOR：保持理由展示组件复用，未改动计算公式、推荐排序或调整候选构造逻辑。

---

## 验证结果

- `.\node_modules\.bin\vitest.cmd run tests/integration/matching/matching-actions.test.ts tests/integration/matching/matching-page.test.tsx`：通过，2 个测试文件、75 个测试全部通过。
- `.\node_modules\.bin\vitest.cmd run tests/unit/ai-reasoning tests/integration/matching/ai-reasoning-cache.test.ts`：通过，5 个测试文件、37 个测试全部通过。
- `.\node_modules\.bin\tsc.cmd --noEmit`：通过。

---

## 问题与决策

### 重新校核理由使用调整后方案身份

**情况**：重新校核结果不是经济型、安全型、均衡型中的原始槽位，而是用户调整后的最终方案。  
**处理**：生成事实时使用 `strategy = "adjusted"` 和 `strategyLabel = "调整后方案"`，并基于服务端最新 `finalEvaluation` 提取成本、强度和风险。  
**影响**：理由不会沿用调整前方案，也不会让 AI 接触可反写的客户端结果。

### 浏览器实测未完成

**情况**：Next 前台启动可正常 Ready，但当前环境下隐藏/后台进程会立即退出，无法稳定保留本地 3000 端口供浏览器工具访问。  
**处理**：已通过页面集成测试覆盖用户路径；未声明完成浏览器实测。  
**影响**：建议后续在本机手动运行开发服务后，再目视确认重新校核结果区的理由标签和正文布局。

---

## 技术债务

无新增技术债务。Task-06 将继续处理“保存历史并让导出复用理由”。
