# 感官友好评估 · 海港区

一个静态网站：给「带敏感的孩子出门前，想知道进去以后会怎么样」的人看。

线上地址：<https://ginkgo2.github.io/>　·　示例数据：在任意页面网址后加 `?demo=1`

六项观察（噪声、突发声、人流拥挤、安静空间、光环境与视觉杂乱、气味），各 1—5 分；
按**最弱一项**定级，不取平均。公开版只展示「推荐」和「有条件推荐」，「不推荐」只留在内部数据里，不点名。

> 这是筛查工具，不是诊断，也不是声级计。

---

## 技术栈

| 层 | 用什么 |
|:---|:---|
| 站点 | 原生 HTML / CSS / JS，零构建、无框架、无后端、无数据库、无密钥 |
| 数据 | `window.SF_POINTS` 直接写在 JS 文件里，页面不需要接口 |
| 地图 | MapLibre GL JS（本地内置，不联网取库）+ OpenStreetMap 数据 |
| 底图 | Node 脚本把 OSM 原始数据渲染成 SVG 和 GeoJSON，随站点发布 |
| 工具 | Node 18+；数据用 Overpass API 抓取 |
| 托管 | GitHub Pages；任何静态托管都能跑 |

不引入框架是刻意的：答辩现场网络不稳，站点要能整包带走、离线可开。

## 目录

```
index.html      首页
list.html       点位清单，按类型和等级筛选
map.html        地图（MapLibre）
tools.html      现场工具：分贝计、十分钟观察、人流与排队、安静空间计时
assess.html     评估表，六项打分、自动定级、导出 JSON
method.html     每一项怎么判、怎么定级、依据和边界
data.html       数据下载、字段说明、许可
assets/css      样式
assets/js       core（评定量表与定级）、各页脚本、选点器、地图共享配置
data/           points.js（点位数据）、places.js、labels.js、demo-points.js、map-*.geojson
assets/img/     haigang.svg（底图）、haigang-detail.svg（细节层）
scripts/        merge.mjs 以及生成底图的脚本
```

## 本地看

- **直接双击 HTML**：首页、清单、评估、方法、数据页都能用（数据走 JS 变量，不走接口）；
- **地图页需要 http(s)**：它用 ES Module 和 WebGL，`file://` 打不开。任意静态服务器即可：

```bash
python -m http.server 8000     # 然后打开 http://localhost:8000/
```

## 自己部署一份

三步，不需要服务器：

1. **拿到文件**：下载本仓库，或只取站点根目录的全部文件；
2. **推到 GitHub**：新建仓库，把文件放到仓库**根目录**（即 `index.html` 在根上），提交；
3. **开 Pages**：仓库 Settings → Pages → Source 选 `Deploy from a branch` → 分支 `main`、目录 `/ (root)` → Save。

等 1—2 分钟：

- 仓库名为 `<你的用户名>.github.io` → 访问 `https://<你的用户名>.github.io/`
- 其他仓库名 → 访问 `https://<你的用户名>.github.io/<仓库名>/`

站内链接全部用相对路径，放在子目录里也能正常工作。

**换别的托管也行**：Netlify（拖拽文件夹）、Cloudflare Pages、Vercel、对象存储 + CDN，只要是静态文件即可。
唯一要求是**走 http(s)**，别用 `file://` 打开地图页。

## 换成你自己的城市

底图不是图片，是脚本按经纬度窗口生成的。改一处、跑几个脚本就行：

1. 改 `scripts/map-config.mjs` 里的 `BBOX`（南、西、北、东）；
2. 抓数据（需要能访问 Overpass API）：

```bash
node scripts/fetch-map-data.mjs   # 道路、水体、公园、地名、POI
node scripts/fetch-detail.mjs     # 建筑、内部路、门
```

3. 生成底图与标签：

```bash
node scripts/build-map.mjs        # → assets/img/haigang.svg + data/labels.js
node scripts/build-detail.mjs     # → assets/img/haigang-detail.svg + data/labels-detail.js
node scripts/build-geojson.mjs    # → data/map-base.geojson + data/map-detail.geojson
```

4. 点位坐标：打开 `map.html?pick=1`，点「标点」，点地图上的位置，复制 `x, y` 填进点位表。

> 原始 OSM 数据不随仓库发布（ODbL 下属于衍生数据库）。站点只用渲染出来的图。

## 从采集到上线

现场：`tools.html` 测数字 → `assess.html` 填六项、选位置 → 导出 JSON。

汇总：

```bash
# 点位清单（id, name, envType, x, y, status）
data/places.csv

# 每次评估导出的 JSON 放进 raw/
raw/HGG-01_2026-11-17.json

# 合并成公开数据
node scripts/merge.mjs --places data/places.csv --raw raw --out data/points.js
```

合并脚本会校验：分值越界、字段缺失、两人定级冲突、有条件推荐却没写条件。
**任何一项报错都不会写出文件**，原数据保持原样。

## 许可

- 代码：**MIT**，见 `LICENSE`
- 点位数据：**CC BY 4.0**
- 底图：由 OpenStreetMap 数据渲染，© OpenStreetMap contributors，按 **ODbL 1.0** 使用；地图属于渲染作品，只署名，不再分发原始数据
- `data/demo-points.js`：仅用于预览，不是真实评估结果

## 限制

- 是筛查不是诊断；六项分数不能当医学结论；
- 分贝计没有校准，指示值只适合同一台手机前后比较；
- 单次观察是快照，不覆盖天气、活动、节假日；
- OSM 在国内的校区、小区内部常常没有数据，底图会空；需要的话自己用 `?pick=1` 补点；
- 地图页依赖 WebGL，老设备可能打不开；其余页面不受影响。

---

制作：东北大学秦皇岛分校 计算机与通信工程学院 2024 级。
