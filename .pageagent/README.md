# PageAgent 专属知识库

这里存放 applecry 公开工作台的稳定系统知识，目的是让 PageAgent 在每个任务开始时直接知道“系统是什么、当前页面能做什么、哪些数据规则不能越过”，不再反复从 DOM 猜产品用途。

## 运行时接入

- `page-agent-knowledge.js` 是浏览器直接加载的运行时知识包。
- `script.js` 将全局知识注入 PageAgent 的 `instructions.system`，并通过 `getPageInstructions(url)` 只提供当前页面相关知识。
- `system-overview.md`、`business-rules.md`、`page-map.yaml` 和 `troubleshooting.md` 是给维护者查看的详细版本。

知识的优先级为：用户明确要求 > 当前页面实际状态 > 本知识库 > PageAgent 推断。知识库与页面冲突时，PageAgent 应说明差异，不得强行按照旧知识操作。

## 更新约定

出现以下变化时应同步更新知识库：

1. 新增、删除或重命名页面和核心控件。
2. 数据来源、可信度规则或日期状态算法发生变化。
3. 收藏、会话、权限或外部跳转行为发生变化。
4. 新增稳定排障结论。

更新后运行：

```powershell
node --test scripts/page-agent-knowledge.test.mjs
```

不要把临时页面内容、具体展会数量、当天新闻或短期故障写进固定知识；这些应该由 PageAgent 从当前页面读取。
