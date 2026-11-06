# AI 选型理由与模板降级 — 阶段二 Task-02 完成报告

**切片（阶段）**：AI 输出校验与模板降级  
**完成时间**：2026-07-04 09:02  
**切片完成标准**：AI Provider 成功且文案与事实一致时返回“AI 生成”；Provider 未配置、失败、超时或文案与事实冲突时，统一返回“模板生成”并保留明确降级原因。

---

## 完成的任务

| 任务 | 测试 | 验收方式 | 状态 |
|------|------|---------|------|
| Task-02: AI 输出校验与模板降级 | AI 理由模块 22 个测试全部通过 | TDD | 完成 |

---

## 文件变更

### 新增

- `src/modules/ai-reasoning/validate-ai-reason.ts` — 实现 AI 文案与服务端事实的一致性校验。
- `src/modules/ai-reasoning/generate-selection-reason.ts` — 实现 Provider 成功、未配置、失败、超时和校验失败时的理由生成编排。
- `tests/unit/ai-reasoning/validate-ai-reason.test.ts` — 覆盖未达标、不可生产、数据不足和参考方案冲突校验。
- `tests/unit/ai-reasoning/generate-selection-reason.test.ts` — 覆盖 AI 成功、Provider 未配置、异常、超时和冲突降级。

### 修改

- `src/modules/ai-reasoning/README.md` — 补充 AI 输出必须经过确定性校验的边界说明。
- `specs/features/AI 选型理由与模板降级_任务规划.md` — 标记 Task-02 完成。

---

## AC 覆盖进度

| AC 编号 | 状态 | 说明 |
|---------|------|------|
| AC-002 | 已满足基础能力 | fake Provider 成功且文案与事实一致时返回 `source = "ai"`、`sourceLabel = "AI 生成"`。 |
| AC-004 | 已满足基础能力 | Provider 未配置或抛错时返回模板理由，不抛出 Provider 原始异常。 |
| AC-005 | 部分满足 | Provider 超时时返回 `fallbackReason = "provider_timeout"`；每日上限仍由 Task-03 实现。 |
| AC-006 | 已满足基础能力 | 未达标事实遇到“已达标 / 强度满足要求”等冲突文案时降级模板。 |
| AC-007 | 已满足基础能力 | 不可生产事实遇到“可生产 / 满足设备限制”等冲突文案时降级模板。 |
| AC-008 | 已满足基础能力 | 文案校验失败时返回 `fallbackReason = "validation_failed"` 的模板理由。 |
| AC-010 | 部分满足 | AI Provider 异常在模块内降级；服务端方案生成接入仍由 Task-04 完成。 |
| AC-011 | 部分满足 | 校验和生成理由只返回展示字段，不修改计算事实；后续接入时继续验证不影响推荐排序。 |

---

## TDD 记录

- RED：新增 `validate-ai-reason.test.ts` 和 `generate-selection-reason.test.ts` 后，测试因目标模块不存在而失败；Task-01 原有测试仍通过。
- GREEN：补充确定性校验、Provider 调用编排、超时兜底和模板降级后，AI 理由模块 22 个测试全部通过。
- REFACTOR：将 Provider 调用与超时包装封装在模块内部，保留 `createSelectionReason` 作为后续服务端动作接入入口。

---

## 验证结果

- `.\node_modules\.bin\vitest.cmd run tests/unit/ai-reasoning`：通过，3 个测试文件、22 个测试全部通过。
- `.\node_modules\.bin\tsc.cmd --noEmit`：通过。

---

## 问题与决策

### 每日上限暂不纳入 Task-02

**情况**：阶段二的总目标包含“达到每日上限时模板降级”，但任务规划中每日上限和缓存已经拆到 Task-03。  
**处理**：Task-02 只实现 Provider 未配置、异常、超时和文案冲突降级；每日上限保留给 Task-03。  
**影响**：阶段二完整闭环需要 Task-03 完成后再成立。

---

## 技术债务

无。
