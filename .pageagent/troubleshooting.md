# 排障手册

## PageAgent 一直显示“准备中”或“加载失败”

1. 检查 `assets/vendor/page-agent.demo.js` 是否成功加载。
2. 本地 SDK 失败时，检查两个 CDN 备用地址是否被网络策略阻断。
3. SDK 已加载但任务失败时，检查 `baseURL` 模型网关，而不是反复点击唤醒按钮。
4. 面板重复或状态异常时，确认旧实例已经 `dispose`，且页面中只有一个有效面板。

## PageAgent 每次重新理解系统

1. 确认页面在 `script.js` 之前加载了 `page-agent-knowledge.js`。
2. 在控制台检查 `window.ApplecryPageAgentKnowledge.version`。
3. 检查 PageAgent 实例的 `config.instructions.system` 是否非空。
4. 检查 `getPageInstructions(location.href)` 是否返回当前页面名称和操作规则。

## 语音输入失败

1. 需要用户主动点击麦克风并允许站点权限。
2. 优先使用 Chrome 或 Edge，并检查 Windows 在线语音识别设置。
3. 部署环境应保留 `_headers` 中的 `Permissions-Policy: microphone=(self)`。
4. 停止按钮代表取消当前录音；识别文本仍需用户确认后发送。

## 首页新闻为空或不新鲜

1. 查看新闻区域状态文字，不要仅看卡片是否为空。
2. 检查 `data/news.json` 是否可访问、结构是否含 topics 和 items。
3. `file://` 预览可能阻止 JSON 请求，应使用本地 HTTP 服务或部署环境复现。
4. 若显示沿用旧结果，检查自动更新工作流与源状态，不能把旧条目称为最新。

## Exhibit Atlas 没有结果

1. 检查数据同步提示与 `data/exhibitions.json` 请求。
2. 依次检查收藏模式、地区、类别、日期范围、搜索词。
3. 自定义结束日期不能早于开始日期。
4. 地图空白时继续检查 Leaflet 和事件经纬度；列表有数据但地图没有通常不是筛选问题。

## 漫展嘉宾雷达没有结果

1. 检查 `data/conventions.json` 与 `conventions.js` 是否加载。
2. 清除搜索词，切回“全部近期”和“日期优先”。
3. 确认活动结束日期没有早于 Asia/Shanghai 的今天。
4. “嘉宾已公布”为空可能是数据仍待官宣，不应降低可信度标准来填充结果。
