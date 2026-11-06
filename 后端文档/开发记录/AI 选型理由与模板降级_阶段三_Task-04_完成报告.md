# AI 选型理由与模板降级 — 阶段三 Task-04 完成报告

**切片（阶段）**：用户生成三套方案后看到理由和来源  
**完成时间**：2026-07-04 09:30  
**切片完成标准**：用户点击生成方案后，经济型、安全型、均衡型每个方案位置都带有选型理由，并标明“AI 生成”或“模板生成”。

---

## 完成的任务

| 任务 | 测试 | 验收方式 | 状态 |
|------|------|---------|------|
| Task-04: 生成三套方案并展示理由来源 | 匹配动作/页面测试 70 个通过，AI 理由相关测试 37 个通过 | TDD | 完成 |

---

## 文件变更

### 修改

- `src/modules/recommendation/types.ts` — 为 `RecommendationSlot` 增加可选 `selectionReason`。
- `src/modules/ai-reasoning/generate-selection-reason.ts` — 新增 `attachSelectionReasonsToSlots`，按推荐槽位附加 AI 或模板理由。
- `src/server/actions/matching-actions.ts` — 在 `generateMatchingScheme` 推荐完成后附加三套理由，并支持注入 Provider、Repository、选项和测试用生成函数。
- `src/app/(main)/matching/_components/box-spec-form.tsx` — 在推荐卡片展示选型理由来源和正文。
- `src/app/(main)/matching/matching.module.css` — 增加推荐卡片理由区块样式。
- `tests/integration/matching/matching-actions.test.ts` — 覆盖 AI 成功、Provider 失败、每日上限、不可用槽位模板兜底和排序/计算不变。
- `tests/integration/matching/matching-page.test.tsx` — 覆盖页面显示来源标签和理由正文，并确认不暴露 `fallbackReason`。
- `specs/features/AI 选型理由与模板降级_任务规划.md` — 标记 Task-04 完成。

---

## AC 覆盖进度

| AC 编号 | 状态 | 说明 |
|---------|------|------|
| AC-001 | 已满足 | 三套推荐槽位均返回并展示 `selectionReason.sourceLabel`。 |
| AC-002 | 已满足 | fake Provider 成功时，有评估结果的槽位显示“AI 生成”。 |
| AC-004 | 已满足 | Provider 抛错时动作仍返回 `ok: true`，理由降级为“模板生成”。 |
| AC-005 | 已满足 | 每日上限达到时不调用 Provider，直接模板降级。 |
| AC-006 | 部分满足 | 当前生成方案卡片可展示未达标风险正文；调整后新理由由 Task-05 完成。 |
| AC-007 | 部分满足 | 不可用槽位不调用 AI，模板理由展示不可用原因；调整后新理由由 Task-05 完成。 |
| AC-009 | 已满足 | 理由事实来自推荐槽位和计算结果，不反写成本、强度或状态。 |
| AC-010 | 已满足 | AI 不可用不阻断生成方案。 |
| AC-011 | 已满足 | 附加理由前后推荐顺序、成本、强度和状态保持不变。 |
| AC-012 | 已满足 | 模板理由仍保持成本、强度、可生产状态和风险提示结构。 |

---

## TDD 记录

- RED：先补充匹配动作和页面集成测试，确认缺少 `selectionReason`、Provider 未接入、页面不展示来源和正文时失败。
- GREEN：为推荐槽位挂载理由，接入 `generateMatchingScheme`，并在页面推荐卡片展示来源标签和正文。
- REFACTOR：将三套槽位附加理由集中到 `attachSelectionReasonsToSlots`，让不可用槽位直接走模板，避免 AI 参与无候选槽位。

---

## 验证结果

- `.\node_modules\.bin\vitest.cmd run tests/integration/matching/matching-actions.test.ts tests/integration/matching/matching-page.test.tsx`：通过，2 个测试文件、70 个测试全部通过。
- `.\node_modules\.bin\vitest.cmd run tests/unit/ai-reasoning tests/integration/matching/ai-reasoning-cache.test.ts`：通过，5 个测试文件、37 个测试全部通过。
- `.\node_modules\.bin\tsc.cmd --noEmit`：通过。

---

## 问题与决策

### 不可用槽位直接模板生成

**情况**：不可用槽位没有 `evaluation`，没有完整成本、强度等计算事实。  
**处理**：`attachSelectionReasonsToSlots` 对这类槽位不调用 Provider，直接使用模板理由说明不可用原因。  
**影响**：避免 AI 基于不完整事实生成误导性文案，也节省每日调用额度。

### 浏览器实测未完成

**情况**：本地启动 Next 预览服务时，Windows 环境中的 `Path`/`PATH` 重复键导致常规后台启动失败；备用启动方式也未能稳定拉起 3000 端口。  
**处理**：已用页面集成测试覆盖来源标签、正文展示和不暴露内部降级原因；未声明完成浏览器实测。  
**影响**：页面行为已有自动化覆盖，但仍建议后续在本机正常启动开发服务后做一次人工目视确认。

---

## 技术债务

无新增技术债务。Task-05 将继续处理“调整后重新校核展示新理由”。
