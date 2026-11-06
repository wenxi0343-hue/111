# AI 选型理由与模板降级 — 阶段一完成报告

**切片（阶段）**：系统具备可靠模板理由  
**完成时间**：2026-07-04 08:55  
**切片完成标准**：即使 AI 完全不可用，系统也能基于已计算结果生成包含成本、强度、可生产状态和风险提示的结构化选型理由。

---

## 完成的任务

| 任务 | 测试 | 验收方式 | 状态 |
|------|------|---------|------|
| Task-01: 理由类型与模板理由 | 9 个测试全部通过 | TDD | ✅ |

---

## 文件变更

### 新增

- `src/modules/ai-reasoning/types.ts` — 定义理由来源、降级原因、理由对象和只读事实结构。
- `src/modules/ai-reasoning/template-reason.ts` — 实现固定四段模板理由生成。
- `src/modules/ai-reasoning/extract-reason-facts.ts` — 从 `CandidateEvaluation` 和 `RecommendationSlot` 提取理由事实。
- `tests/unit/ai-reasoning/template-reason.test.ts` — 覆盖 Task-01 的模板理由、风险措辞、缺数据和模块边界验证。

### 修改

- `src/modules/ai-reasoning/README.md` — 补充模块边界，明确 AI 理由不参与计算和推荐排序。
- `specs/features/AI 选型理由与模板降级_任务规划.md` — 标记 Task-01 完成。

---

## AC 覆盖进度

| AC 编号 | 状态 | 说明 |
|---------|------|------|
| AC-004 | ✅ 部分满足 | 模板理由已可作为 AI 不可用时的兜底结构，后续 Task-02/04 接入降级编排。 |
| AC-006 | ✅ 已满足 | 未达标事实会保留强度风险，且模板不描述为已达标。 |
| AC-007 | ✅ 已满足 | 不可生产事实会保留设备风险，且模板不描述为生产无障碍。 |
| AC-009 | ✅ 部分满足 | 理由事实只从已计算结果和推荐槽位提取，不重新计算；后续缓存和服务端编排继续验证。 |
| AC-011 | ✅ 部分满足 | AI 理由模块不导入页面、服务端动作或推荐排序函数；后续接入时继续验证不影响状态。 |
| AC-012 | ✅ 已满足 | 模板固定输出成本、强度、可生产状态、风险提示四段，缺数据时不编造数值。 |

---

## TDD 记录

- RED：新增 `tests/unit/ai-reasoning/template-reason.test.ts` 后，测试因 `extract-reason-facts` 等模块尚不存在而失败。
- GREEN：补充类型、事实提取和模板理由后，目标测试 9 项全部通过。
- REFACTOR：将模板正文拆为成本、强度、可生产状态和风险提示四个小函数，保持后续 AI 校验和服务端编排可复用。

---

## 验证结果

- `.\node_modules\.bin\vitest.cmd run tests/unit/ai-reasoning/template-reason.test.ts`：通过，1 个测试文件、9 个测试全部通过。
- `.\node_modules\.bin\tsc.cmd --noEmit`：通过。

---

## 问题与决策

### 测试命令入口

**情况**：直接运行 `pnpm vitest run tests/unit/ai-reasoning/template-reason.test.ts` 时，当前环境没有正确解析本地 `vitest` 命令。  
**处理**：改用项目本地可执行文件 `.\node_modules\.bin\vitest.cmd` 运行同一测试。  
**影响**：后续阶段如遇到同样情况，可继续使用本地可执行文件进行验证。

---

## 技术债务

无。
