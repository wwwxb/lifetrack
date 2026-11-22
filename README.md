# LifeTrack · 迹录

> 把 Apple 健康里散落的碎片数据，拼成属于你的生活画像。

四个板块：**全记录汇总 · 步履轨迹 · 耳机听觉档案 · 热力刻度**。
夜景玻璃视觉（固定光球背景 + 薄玻璃卡 + 发光折线 + 胶囊分段），中英双语，六套皮肤。
**全程在浏览器里解析，文件不上传。**

---

## 两个构建

| 构建 | 用途 | 含个人数据 |
|---|---|---|
| `lifetrack.html` | 自己双击打开（0.72 MB，离线可用，内联真实数据） | ✅ 是 |
| `dist/` | **公开部署**（0.45 MB，只有演示数据） | ❌ 否 |

```bash
node tools/bundle.mjs          # → lifetrack.html   （个人版）
node tools/make-demo.mjs       # → data/demo.json   （合成演示数据）
node tools/build-dist.mjs      # → dist/            （公开版）
```

**开发预览**：`node tools/serve.mjs 8901` → http://127.0.0.1:8901/ （`dist/` 在 `/dist/`）

**部署到 Cloudflare Pages**：

```bash
cd podsound
node tools/build-dist.mjs
npx wrangler pages deploy dist --project-name lifetrack
```

也可以在 Cloudflare 面板里直接把 `dist/` 拖进去（无需构建命令、无需框架预设）。
部署拿到域名后，把 `index.html` 里的 `og:image` 改成绝对地址，微信/Twitter 才会有预览图。

---

## 使用路径

| 入口 | 说明 |
|---|---|
| 选择文件 / 拖拽 | 上传 iPhone「健康」导出的 `export.zip`（或 `export.xml`），本机流式解析 |
| 先看一份真实样例 | 读 `data/prepared.json`（打包时的真实数据），秒开 |
| `?sample=1` | 直接进样例驾驶舱 |
| `?sec=steps` | 直接打开某个板块：`summary` / `steps` / `audio` / `vitals` |
| `?preset=90` | 直接选好时间段：`all` / `1y` / `90` / `30` / `7` |
| `?lang=en` | 英文界面（顶栏 中/EN 随时切换） |
| 解析进度 | 读取 → 解压 → 扫描 → 汇总 四段，带百分比、已处理 MB、已解析条数、耗时，可随时取消 |

---

## 四个板块

### 01 全记录汇总
- 顶部四个大数字：记录条数 / 数据类别 / 覆盖天数 / 时间跨度 —— **全部跟随时间筛选**
  （记录条数按天精确累加，数据类别只算区间内真正出现的类型，时间跨度按区间显示「天 / 个月 / 年」）
- **生活画像**：把四块拼成一句话，紧跟在四个大数字下面
- **记录条数构成**：环形图 + 九行图例（占比百分数），标的是全部年份的构成
- **全部数据类别**：六列表格（数据类别 · 记录条数 · 覆盖天数 · 累计 · 单条平均 · 最大），
  记录列带占比条；手机端自动变成逐张卡片，六个字段一样不少

### 02 步履轨迹
- 步数五个固定窗口：本年 / 近 6 个月 / 近 30 天 / 近 7 天 / **全部**（各带日均；全部块在手机上独占一行）
- **逐年步数**：2016 → 2026 横滑（紧跟步数窗口）
- **近 12 个月步数走势**（带月份标签的发光折线）
- 距离 / 步长 / 步行速度 / 爬楼层数 —— 四张趋势卡，各自只画有数据的区间并在轴上标出起止
- **跑步记录**：最近 6 次，距离 + 配速 + 真实 GPS 轨迹缩略图

### 03 耳机听觉档案
设备胶囊 → 大数字聆听时长（可拖拽框选放大）→ 六张指标小卡 → 聆听日历 → 时段钟盘 →
耳机档案（服役区间，只显示耳机名，不显示型号代码）→ 安全聆听（WHO 60/60）。

### 04 热力刻度
心率（按天的柱状 + 采样说明）· 基础能量消耗（面积 + 日均）·
活动能量消耗（圆环达标 + 日历热力）· 双支撑占比（趋势 + 均值）。

---

## 数据链路

```
export.zip
  └─ lib/zip.js         中央目录 + DecompressionStream('deflate-raw') 流式解压
      └─ lib/parse-core.js  逐行扫描 15 万行 XML
          └─ Collector.finish()   会话 / 日聚合 / 时段分布 / 覆盖表
              └─ app.js compute() 按时间段切片 → 四个板块
```

- **解析跑在 Web Worker 里**，主线程不卡；桌面 Chrome 实测 154 MB / 37.8 万条 ≈ 1.2 秒
- 浏览器不支持 `DecompressionStream` 时（iOS < 16.4）会提示改用 `export.xml` 直接上传
- 产物 `data/prepared.json` **0.53 MB**：6,230 段聆听会话 + 3,659 天日序列 + 13 条轨迹

**耳机会话口径**：间隔 > 180 秒断开、单段 < 60 秒丢弃、平均 ≥ 80 dB 记一次「偏响」；
同型号换新配对（不同蓝牙 MAC）自动合并。

**日期口径**：导出里的本地时间当作墙上时钟，不做时区换算。

---

## 目录

```
podsound/
├── dist/                    ← 部署这个目录（0.45 MB，只含演示数据）
├── lifetrack.html           个人离线版（已 gitignore，不进仓库）
├── index.html               开发入口（= dist/index.html 的源）
├── styles.css               设计 token 与组件
├── app.js                   控制器：四个板块 + 时间筛选 + 事件
├── lib/
│   ├── zip.js               ZIP 目录解析 + 流式解压
│   ├── parse-core.js        Apple Health XML 扫描器（浏览器 / Node 共用）
│   ├── scan.js              整条解析流水线（读 → 解压 → 扫描 → 汇总）
│   ├── scan-worker.js       Worker 壳
│   ├── charts.js            自绘 SVG：折线、柱、日历、钟盘、环形、雷达、轨迹
│   ├── i18n.js              中英双语
│   ├── skins.js             6 套皮肤
│   └── persona.js / insights.js
├── data/
│   ├── demo.json            合成演示数据（会进仓库）
│   └── prepared.json        你的真实数据（已 gitignore）
├── tools/
│   ├── bake.mjs             export.zip → prepared.json
│   ├── make-demo.mjs        生成演示数据
│   ├── build-dist.mjs       打 dist/（公开版）
│   ├── bundle.mjs           内联成 lifetrack.html（个人版）
│   ├── make-og.py           生成 og.png
│   └── serve.mjs            本地服务器（禁缓存）
├── privacy.html             隐私说明页
├── robots.txt / _headers    抓取规则 / 响应头
├── og.png                   1200×630 分享图
├── DESIGN.md                设计方案 + 实现记录
└── README.md
```

---

## 重新生成

```bash
node tools/bake.mjs "E:/path/to/导出.zip" data/prepared.json   # 换数据
node tools/bundle.mjs                                          # 重新打包单文件
```

---

## 隐私

没有任何跨站点请求；没有后端、没有排行、没有埋点。解析与统计全部在本机完成。
公开版自带的样例是**程序生成的假数据**（`meta.demo = true`），不含任何真实记录。
构建脚本会校验 `dist/data/` 里只允许 `demo.json`，防止真实导出被误打包。

详细说明见站内 `privacy.html`。

---

## 已知取舍

- 「本年 / 近 6 个月 / 近 30 天 / 近 7 天」是**固定窗口**（相对最后一条数据），不跟随时间筛选；
  其余图表跟随筛选。
- 耳机板块有自己的窗口（首个记录日 → 最后记录日），否则选定「全部」时折线前 8 年是空白。
- 双支撑 / 步长 / 步速 / 基础能量这类指标只有 2024 年后的数据，卡片会自动只画有数据的区间。
- 步数与距离是原始样本直接相加（Apple 导出即如此），旧机与新机同段可能各计一次。
- 这份导出没有睡眠、血氧、静息心率、HRV、体重、血压 —— 页面上做了明确说明。
