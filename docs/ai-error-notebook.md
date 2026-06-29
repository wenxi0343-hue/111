# AI 错题本

当 AI 生成的代码出现问题时，按以下格式记录。

```md
## YYYY-MM-DD - 错误标题

- 错误类型：类型错误 / 逻辑错误 / 规范违规 / 依赖错误
- 错误描述：
- 根因分析：
- 正确做法：
- 关联文件：
```

## 2026-06-28 - ESLint 旧桥接配置不兼容

- 错误类型：依赖错误
- 错误描述：初始化时使用 `FlatCompat` 加载 `next/core-web-vitals` 和 `next/typescript`，在当前 ESLint 与 Next 依赖组合下触发循环结构错误，导致 `pnpm lint` 无法运行。
- 根因分析：已安装的 `eslint-config-next` 提供 flat config 入口，继续通过旧式 extends 桥接会经过兼容层校验，遇到插件配置中的循环引用。
- 正确做法：直接从 `eslint-config-next/core-web-vitals` 和 `eslint-config-next/typescript` 导入 flat config，并在后续配置项里追加项目规则。
- 关联文件：`eslint.config.mjs`

## 2026-06-28 - 初始化依赖自动升级到未纳入规范的大版本

- 错误类型：依赖错误
- 错误描述：安装开发依赖时自动解析到 ESLint 10 和 TypeScript 6，超出 `specs/开发规范.md` 中定义的 TypeScript 5.x 范围，并导致 React ESLint 插件在运行时抛错。
- 根因分析：依赖安装未限制工具链主版本，包管理器按 registry 最新版本解析，拉到了当前项目规范尚未覆盖的大版本。
- 正确做法：初始化时显式约束关键开发工具主版本，当前项目使用 `typescript@^5`、`eslint@^9`、`@types/node@^20`。
- 关联文件：`package.json`
