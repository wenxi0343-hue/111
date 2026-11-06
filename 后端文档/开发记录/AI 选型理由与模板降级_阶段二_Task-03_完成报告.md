# AI 选型理由与模板降级 — 阶段二 Task-03 完成报告

**切片（阶段）**：缓存与每日上限基础  
**完成时间**：2026-07-04 09:10  
**切片完成标准**：系统具备 AI 理由缓存 key、缓存读写/过期判断、每日调用上限计数，以及对应数据库表和服务端环境变量占位。

---

## 完成的任务

| 任务 | 测试 | 验收方式 | 状态 |
|------|------|---------|------|
| Task-03: 缓存与每日上限基础 | AI 单元/集成相关 37 个测试通过 | TDD | 完成 |

---

## 文件变更

### 新增

- `src/modules/ai-reasoning/cache.ts` — 实现缓存 key、用量日期、TTL 计算、仓储契约和内存仓储。
- `src/db/schema/ai-reasoning.ts` — 定义 `ai_reasoning_cache` 和 `ai_reasoning_daily_usages` 两张表。
- `src/db/migrations/0005_ai_reasoning_cache.sql` — 新增 AI 理由缓存和每日用量迁移。
- `tests/unit/ai-reasoning/cache.test.ts` — 覆盖缓存 key、缓存命中/过期、每日上限和缓存命中不增用量。
- `tests/integration/matching/ai-reasoning-cache.test.ts` — 覆盖 schema 导出、迁移 SQL 和 `.env.example` AI 变量。

### 修改

- `src/modules/ai-reasoning/generate-selection-reason.ts` — 接入可选仓储：缓存命中复用 AI 理由，达到每日上限时模板降级。
- `src/db/schema/index.ts` — 导出 AI reasoning schema。
- `src/db/migrations/meta/_journal.json` — 记录 `0005_ai_reasoning_cache` 迁移。
- `.env.example` — 补充 `AI_REASONING_MODEL`、`AI_REASONING_TIMEOUT_MS`、`AI_REASONING_DAILY_LIMIT`。
- `specs/features/AI 选型理由与模板降级_任务规划.md` — 标记 Task-03 完成。

---

## AC 覆盖进度

| AC 编号 | 状态 | 说明 |
|---------|------|------|
| AC-003 | 部分满足 | 缓存 key 会随成本和最终状态变化，为调整后重新生成理由提供基础。 |
| AC-005 | 已满足基础能力 | Provider 调用前检查每日上限；达到上限时返回 `daily_limit_reached` 模板理由。 |
| AC-009 | 部分满足 | cache key 只基于 `SelectionReasonFacts` 中的计算事实和风险信息。 |
| AC-010 | 部分满足 | 缓存命中不调用 Provider、不增加每日用量；完整服务端动作接入仍由 Task-04 完成。 |

---

## TDD 记录

- RED：新增 `cache.test.ts` 和 `ai-reasoning-cache.test.ts` 后，测试因缓存模块、schema、迁移和环境变量不存在而失败。
- GREEN：新增缓存仓储、schema、迁移、环境变量，并把可选仓储接入 `createSelectionReason` 后，目标测试通过。
- REFACTOR：将缓存 key、用量日期和 TTL 计算保持为纯函数，便于后续替换为数据库仓储。

---

## 验证结果

- `.\node_modules\.bin\vitest.cmd run tests/unit/ai-reasoning tests/integration/matching/ai-reasoning-cache.test.ts`：通过，5 个测试文件、37 个测试全部通过。
- `.\node_modules\.bin\vitest.cmd run tests/integration/db/schema-and-migration.test.ts tests/integration/matching/ai-reasoning-cache.test.ts`：通过，2 个测试文件、9 个测试全部通过。
- `.\node_modules\.bin\tsc.cmd --noEmit`：通过。

---

## 问题与决策

### 仓储先提供契约和内存实现

**情况**：Task-03 需要缓存和每日上限基础能力，Task-04 才会把理由生成接入生成方案服务端动作。  
**处理**：本任务先定义 `AiReasoningRepository` 契约和内存实现，并在 `createSelectionReason` 中支持可选仓储。  
**影响**：后续 Task-04 可直接注入真实数据库仓储或测试仓储，不需要改变理由生成入口。

---

## 技术债务

无。
