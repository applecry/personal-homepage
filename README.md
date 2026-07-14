# personal-homepage

applecry 的个人主页。静态站点，可直接部署到 Cloudflare Pages。

## 本地预览

直接用浏览器打开 `index.html` 可以看大部分页面。新闻板块会读取 `data/news.json`，部分浏览器在 `file://` 下会限制本地 JSON 读取，部署到 Cloudflare Pages 后正常。

## 部署到 Cloudflare Pages

Cloudflare Pages 构建设置：

- Framework preset: `None`
- Build command: 留空
- Build output directory: `/`

自定义域名配置见 [DEPLOY.md](./DEPLOY.md)。

## 每日新闻

首页的“热点”板块读取 `data/news.json`，展示 AI、美股、A股三个主题的每日推荐。

自动更新由 GitHub Actions 完成：

- 工作流：`.github/workflows/update-news.yml`
- 运行时间：每天 08:30（Asia/Shanghai）
- 手动运行：GitHub 仓库的 Actions 页面里选择 `Update daily news signals`，点击 `Run workflow`
- 数据生成脚本：`scripts/update-news.mjs`
- 数据源：Bing News RSS

脚本会尽量抓取最新主题相关新闻，只保留带有中文原始摘要且不重复的条目，每个主题最多展示 6 条。抓取失败时会保留上一次数据，避免首页变空。

## 文件结构

- `index.html`: 页面内容
- `styles.css`: 样式
- `script.js`: 页面交互、音乐播放器、新闻加载、PageAgent 增强
- `data/news.json`: 每日新闻数据
- `scripts/update-news.mjs`: 新闻更新脚本
- `.github/workflows/update-news.yml`: 定时新闻更新任务
- `_headers`: Cloudflare Pages 响应头与缓存策略
- `assets/hero-workspace.png`: 首页视觉图
- `assets/audio/`: 本地音乐文件
- `assets/vendor/page-agent.demo.js`: PageAgent 本地 SDK

## PageAgent

页面右下角的 `AI` 按钮会在页面空闲后预加载本地 PageAgent SDK：`assets/vendor/page-agent.demo.js`，点击按钮打开面板。面板输入框增强了基于 Web Speech API 的语音输入，录音时实时把识别文字写入输入框，用户确认后再发送给 PageAgent。

当前配置使用演示模型网关，不在前端暴露真实模型 Key。正式使用时建议把 `script.js` 里的 `baseURL` 换成自己的后端 LLM Proxy，并在服务端保存 API Key、做限流和审计。

### 语音输入权限

如果浏览器提示麦克风权限被拒绝，请点地址栏左侧锁图标，将麦克风改为允许后刷新页面。Windows 还需要在系统设置里允许浏览器访问麦克风。

如果站点权限已经允许但仍失败，通常是浏览器的 Web Speech API 服务没有启动。可以刷新后直接点麦克风，或换 Chrome/Edge 再试；Windows 上还可以检查系统的在线语音识别设置。

语音胶囊中的停止按钮会直接取消当前录音；识别文字区域支持多行显示和内部滚动，长文本不会再被一行省略。语音文字会显示在输入框上方，输入框始终保留在下方可编辑。

部署环境需要允许麦克风权限策略。Cloudflare Pages 的 `_headers` 已允许 `microphone=(self)`，否则浏览器即使显示麦克风已允许，Web Speech API 也会被响应头拦截。

## Music

页面包含一个轻量音乐面板，内置 NIGHT DANCER、Judgement（恶魔人）、Night Cruising、日落大道四首常驻背景音。音乐文件放在 `assets/audio/`，切换歌单后可直接播放对应音频。

## 小红书展览线索

展览页会从 `data/exhibition-signals.json` 读取小红书公开搜索结果，把它们作为“社交热度与展览发现线索”展示，不会把用户笔记直接当成日期、票价或场馆事实。

本地更新前需要在 Chrome/Edge 中安装 OpenCLI 扩展并登录小红书，然后运行：

```powershell
node scripts/update-xhs-exhibition-signals.mjs
```

该步骤依赖本机浏览器登录态，不放进 GitHub Actions，也不会把 Cookie 写入仓库。官方与聚合站排期仍由 `.github/workflows/update-exhibitions.yml` 每日更新。
