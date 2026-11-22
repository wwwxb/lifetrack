# 部署到 GitHub + Cloudflare Pages

目标：仓库里放源码和**已构建好的 `dist/`**，Cloudflare Pages 直接把这个目录当静态站点发布。
不需要构建命令、不需要 Node 环境、不产生任何服务器成本。

> **隐私红线**：`lifetrack.html` 和 `data/prepared.json` 里有你的真实健康数据，已在 `.gitignore` 里排除。
> 仓库里只有 `data/demo.json`（程序生成的假数据）。上传前请确认这两个文件没有出现在 GitHub 上。

---

## 一、GitHub：把项目传上去

### 路线 A（推荐，两条命令）

本机 `podsound/` 目录已经是一个初始化好、提交完成的 git 仓库（43 个文件，不含个人数据）。

1. 在 GitHub 上建空仓库：右上角 **+ → New repository**
   - Repository name：`lifetrack`
   - 选 **Public**（代码公开没关系，数据不在里面）或 Private（Cloudflare 也支持，只是要多授权一次）
   - **不要**勾 Add a README / .gitignore / license（我们都有）
   - 点 **Create repository**
2. 复制页面上给出的仓库地址，然后在终端执行：

```bash
cd F:/dsh开发1/podsound
git remote add origin https://github.com/<你的用户名>/lifetrack.git
git branch -M main
git push -u origin main
```

第一次 push 会弹出 GitHub 登录窗口，授权即可。

### 路线 B（纯网页，不想碰命令行）

1. 同样先建空仓库（同上）。
2. 打开我准备好的干净副本：`F:\dsh开发1\lifetrack-repo\`
   （这是 `git archive` 导出的版本，**已经剔除**了 `lifetrack.html`、`data/prepared.json` 等个人文件）
3. 仓库首页点 **Add file → Upload files**，把 `lifetrack-repo` **里面的全部内容**拖进上传区
   - 是拖「里面的内容」，不是拖 `lifetrack-repo` 这个文件夹本身
   - 必须包含 `dist/` 整个目录（`dist/lib/`、`dist/data/demo.json` 都在里面）
4. 底部 Commit changes 填 `init` → **Commit changes**

> ⚠️ 不要直接把 `podsound` 整个文件夹拖进网页上传：网页上传**不会**读 `.gitignore`，
> `lifetrack.html` 和 `data/prepared.json` 会被一起传上去。

---

## 二、Cloudflare Pages：连仓库、发站点

1. 打开 <https://dash.cloudflare.com/> → 登录
2. 左侧 **Workers & Pages** → 右上角 **Create** → 选 **Pages** 标签 → **Connect to Git**
3. 点 **Connect GitHub**，授权 Cloudflare 访问你的仓库
   - 选 **Only select repositories**，勾上刚建的 `lifetrack`（或选 All repositories）
4. 回到 Cloudflare，选中 `lifetrack` → **Begin setup**
5. 填写构建设置（关键三项）：

| 字段 | 填什么 |
|---|---|
| Project name | `lifetrack`（会成为 `lifetrack.pages.dev`，可改） |
| Production branch | `main` |
| Framework preset | **None** |
| Build command | **留空** |
| Build output directory | `dist` |

6. 点 **Save and Deploy**，等 20–60 秒，状态变成 **Success**
7. 顶部会出现域名：`https://lifetrack.pages.dev` —— 这个地址现在可以发给任何人了

之后每次 `git push` 到 `main`，Cloudflare 会自动重新发布（增量、几乎秒级）。

### 部署后必做的一件小事

把分享卡片改成绝对地址，否则微信/Twitter 抓不到预览图：

1. 在 GitHub 仓库里打开 `index.html`，点铅笔图标编辑
2. 找到这一行：
   ```html
   <meta property="og:image" content="og.png">
   ```
   改成本次部署的真实域名：
   ```html
   <meta property="og:image" content="https://lifetrack.pages.dev/og.png">
   ```
3. 同样改 `dist/index.html` 里的这一行（部署用的是 dist 里的那份）
4. Commit changes → Cloudflare 自动重新部署

> 也可以先在 Cloudflare 绑定自定义域名（Pages → 你的项目 → Custom domains → Set up a custom domain），
> 拿到自己的域名后再把 `og:image` 改成那个域名。

---

## 三、上线前自查清单

- [ ] GitHub 仓库文件列表里**没有** `lifetrack.html`、没有 `data/prepared.json`
- [ ] `dist/index.html` 里能搜到 `window.__SAMPLE_URL__ = "data/demo.json"`
- [ ] 打开 `https://<你的域名>/` 能看到首页；点「看一份演示数据」能出四板块
- [ ] 打开 `https://<你的域名>/privacy.html` 正常
- [ ] 手机上打开，选一次自己的 `export.zip`，确认解析进度走完、图表出来
- [ ] 上传一个无关的 zip，确认提示「没有找到 Apple 健康的导出文件」而不是白屏

---

## 四、本地改了代码之后怎么更新线上

```bash
cd F:/dsh开发1/podsound

# 改了 index.html / app.js / lib/* 之后，先重建公开版
node tools/build-dist.mjs

git add -A
git commit -m "update"
git push
```

Cloudflare 会自动把新的 `dist/` 发上去。

## 五、如果想换成 Cloudflare 那边构建（可选）

不想每次把 `dist/` 一起提交，也可以让 Cloudflare 自己构建：

| 字段 | 填什么 |
|---|---|
| Build command | `node tools/build-dist.mjs` |
| Build output directory | `dist` |

这样 `dist/` 就可以从仓库里删掉、加进 `.gitignore`。但构建机每次都要重新生成演示数据，
多了个可能失败的环节；当前「提交 dist」的方式最稳，也最快。
