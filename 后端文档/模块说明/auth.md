# auth

首版简单登录、会话状态和服务端动作访问保护。

## 关键服务端动作接入

生成方案、保存、导入、导出等关键 Server Action 必须在业务逻辑执行前调用
`requireAuthenticatedAction()`。当返回失败时，直接把失败结果返回给页面，不继续执行后续业务逻辑；
当返回成功时，可使用返回的 `username` 和 `displayName` 作为当前登录用户上下文。
