# personal-homepage

个人主页。一个纯静态个人主页，可直接部署到 Cloudflare Pages。

## 本地预览

直接用浏览器打开 `index.html`。

## 部署到 Cloudflare Pages

Cloudflare Pages 构建设置：

- Framework preset: `None`
- Build command: 留空
- Build output directory: `/`

自定义域名配置见 [DEPLOY.md](./DEPLOY.md)。

## 文件结构

- `index.html`: 页面内容
- `styles.css`: 样式
- `script.js`: 滚动导航和深浅色切换
- `_headers`: Cloudflare Pages 响应头与缓存策略
- `assets/hero-workspace.png`: 首页视觉图
- `assets/vendor/page-agent.demo.js`: PageAgent 本地 SDK

## PageAgent

页面右下角的 `AI` 按钮会懒加载本地的 PageAgent SDK：`assets/vendor/page-agent.demo.js`。

当前配置使用演示模型网关，不在前端暴露真实模型 Key。正式使用时建议把 `script.js` 里的 `baseURL` 换成自己的后端 LLM Proxy，并在服务端保存 API Key、做限流和审计。
