# 纸箱自动配纸工具

面向纸箱厂工艺人员和销售业务员的自动配纸工具，用于单次纸箱配纸、成本核算、强度校核、方案调整和报告导出。

## 当前阶段

项目已完成规格文档和基础骨架初始化。

核心文档：

- `需求文档/产品与规划/纸箱自动配纸工具-PRD-V1.0.md`
- `需求文档/产品与规划/开发路线图.md`
- `后端文档/项目规范/技术栈.md`
- `后端文档/项目规范/项目结构.md`
- `后端文档/项目规范/开发规范.md`
- `ui设计文档/预览素材/`
- `前端文档/前端说明.md`

## 本地启动

```bash
pnpm install
pnpm dev
```

## 常用命令

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

## 数据库基础流程

配置 `DATABASE_URL` 后，按以下顺序验证数据库基础设施：

```bash
pnpm db:check
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## 开发约束

- 核心计算必须放在 `src/modules/calculations/`。
- 原纸代码映射必须放在 `src/modules/paper-code/`。
- 历史订单习惯分析必须放在 `src/modules/historical-orders/`。
- 页面只负责展示和交互，不承载面积、强度、成本公式。
- 真实订单数据和纸价数据不得复制到测试夹具，测试数据必须脱敏。
