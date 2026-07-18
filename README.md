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
- 运行时间：每天 08:17、14:17（Asia/Shanghai）各检查一次；GitHub 定时任务可能延迟启动
- 手动运行：GitHub 仓库的 Actions 页面里选择 `Update daily news signals`，点击 `Run workflow`
- 数据生成脚本：`scripts/update-news.mjs`
- 数据源：Google News RSS、WIRED AI RSS、Le Monde AI RSS；Bing 仅保留为可用性探测

脚本会并行抓取多个查询与来源，校验响应确实为含条目的 RSS/Atom，再去重并为每个主题保留最多 6 条。每次运行都会记录检查时间、来源状态与主题新鲜度；抓取失败时保留上一次数据，并在页面明确标注“沿用旧结果”。工作流最后会校验 AI 主题本次是否取得新结果，避免静默成功。

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

PageAgent 启动时会加载 `page-agent-knowledge.js` 中的专属知识库。稳定的系统定位通过 `instructions.system` 注入，每个页面的目标、能力、业务规则和排障顺序通过 `getPageInstructions(url)` 按需注入。维护说明和详细规则位于 `.pageagent/`；修改后运行 `node --test scripts/page-agent-knowledge.test.mjs` 校验知识覆盖。

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

该步骤依赖本机浏览器登录态，不放进 GitHub Actions，也不会把 Cookie 写入仓库。展会事实数据以“上海市会展业公共信息服务平台”的已备案项目为主库，并结合 `data/exhibitions-curated.json` 中的上海市商务委重点展会排期与近期官方发布；采集器会补充备案状态、文号、主办方、展览面积、展会类型和同期展会，并探测国家会展中心、上海新国际博览中心、上海世博展览馆等场馆排期。`.github/workflows/update-exhibitions.yml` 每日更新上海排期，同时从公开聚合页补充待官网复核的长尾线索；既有的未来全球精选会继续保留，避免上海日更误删其他地区内容。

## 漫展嘉宾雷达

`conventions.html` 是 Exhibit Atlas 的漫展入口，默认把嘉宾、出席日期和签售安排放在活动日期与票务之前。页面读取 `data/conventions.json`，支持按嘉宾、漫展、城市搜索，按城市与日期筛选，并可只看“嘉宾已公布”“嘉宾待官宣”或当前设备关注的活动。

- 活动发现、日期、场馆、票价和购票状态：B站会员购、大麦
- 嘉宾名单：优先使用票务页的结构化“参展嘉宾”字段；没有时使用主办方官宣复核
- 未公布嘉宾：明确显示“嘉宾待公布”，不会从海报角色、票根图案或展商名单猜测真人嘉宾
- 我的关注：使用浏览器 `localStorage` 保存，不需要账号；再次访问时会将当前嘉宾名单与本设备上次快照比较，标出新增嘉宾
- 详情页：逐人展示出席日与签售时间，并保留平台/主办方来源链接和日历导出
- 数据校验：`scripts/conventions-data.test.mjs` 检查日期区间、嘉宾状态、重复嘉宾与 HTTPS 来源；GitHub Actions 会和交互测试一起运行
