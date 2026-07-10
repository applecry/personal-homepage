# Cloudflare Pages 上线步骤

这个目录可以直接部署到 Cloudflare Pages。

## 最快方式：Direct Upload

1. 打开 Cloudflare Dashboard。
2. 进入 Workers & Pages。
3. 选择 Create application。
4. 选择 Pages。
5. 选择 Upload assets / Direct Upload。
6. 项目名建议填 `personal-homepage`。
7. 上传整个 `qiaomu-inspired-homepage` 文件夹里的内容。
8. 部署成功后会得到一个 `*.pages.dev` 预览域名。

## 更推荐：GitHub 自动部署

1. 新建一个 GitHub 仓库，例如 `personal-homepage`。
2. 把本目录的所有文件提交到仓库根目录。
3. Cloudflare Dashboard -> Workers & Pages -> Create application -> Pages。
4. 选择 Connect to Git。
5. 选择刚才的 GitHub 仓库。
6. 构建设置：
   - Framework preset: None
   - Build command: 留空
   - Build output directory: `/`
7. 点击 Deploy。

## 绑定自己的域名

当前域名为 `lijunearth.online`。推荐把根域名 `lijunearth.online` 作为主站，同时添加 `www.lijunearth.online` 并跳转到主站。

Cloudflare Pages 里：

1. 进入项目。
2. 打开 Custom domains。
3. 添加 `lijunearth.online` 和 `www.lijunearth.online`。
4. 按提示让 Cloudflare 自动创建 DNS 记录。
5. 如果域名不在 Cloudflare 注册，需要把域名的 nameserver 改成 Cloudflare 提供的两个 nameserver。

Cloudflare 接管 DNS 后会自动签发 HTTPS 证书。DNS 生效后，Pages 项目里把自定义域名设为主域名即可。

## 当前文件

- `index.html`: 首页内容和工作台入口
- `styles.css`: 样式
- `script.js`: 滚动导航和深浅色切换
- `notes/`: 可直接访问的公开复盘
- `projects.html`: 项目档案
- `_headers`: Cloudflare Pages 响应头与缓存策略
- `assets/hero-workspace.png`: 首页视觉图
