# 方案确认与保存闭环 — 阶段三 Task-04 完成报告

## 任务范围

Task-04 目标是补齐“调整后重新校核”的服务端基础能力：用户修改层数、瓦型或层位原纸后，系统基于当前原纸资料重新构造候选方案，并调用确定性计算得到最新状态。

## 已完成内容

- 新增调整输入类型和重新校核结果类型。
- 新增 `buildAdjustedCandidate`，支持按调整项生成新的候选方案。
- 构造候选时只使用当前可推荐原纸资料，不信任客户端传入的价格、强度或成本字段。
- 新增 `recalculateAdjustedScheme` 服务端动作，复用登录保护、纸箱输入校验和 `ActionResult`。
- 重新校核结果支持映射 `qualified`、`unqualified`、`not_manufacturable`、`data_incomplete`。
- 调整引用不存在或停用原纸时返回 `DATA_NOT_FOUND` 和业务提示。

## 验证结果

- RED：新增候选构造和重新校核测试后，因模块/动作未实现而失败。
- GREEN：实现候选构造与重新校核后，Task-04 相关测试通过。
- 回归：`pnpm vitest run tests/unit/scheme-adjustment/build-adjusted-candidate.test.ts tests/unit/scheme-adjustment/create-history-snapshot.test.ts tests/integration/matching/matching-actions.test.ts tests/integration/matching/matching-page.test.tsx tests/integration/matching/matching-scheme-history.test.ts` 通过，59 个测试通过。
- 类型检查：`pnpm typecheck` 通过。

## 相关文件

- `src/modules/scheme-adjustment/types.ts`
- `src/modules/scheme-adjustment/build-adjusted-candidate.ts`
- `src/server/actions/matching-actions.ts`
- `tests/unit/scheme-adjustment/build-adjusted-candidate.test.ts`
- `tests/integration/matching/matching-actions.test.ts`

## 后续衔接

下一步进入 Task-05：在页面上增加调整控件和“待重新校核”状态，让用户实际触发本次新增的 `recalculateAdjustedScheme`。
