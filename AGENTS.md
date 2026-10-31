# 给 AI 工具与新接手的人

本文件是跨工具的入口约定（AGENTS.md 标准）。细节在 `README.md`、`DEBUGGING.md`、
`docs/DEPLOYMENT.md` 里，这里只写**容易做错**的几条。

## 本地起服务：用 `npm run dev:watch`

```
npm run dev:watch
```

**不要**用 `npm run dev`。两者只差 `tsx watch`：`dev` 只在启动时读一次后端代码，改了
`server/*.ts` 不重启就看不到效果，容易被误判成"改动无效"。`dev:watch` 后端也会自动重启。

- 前端（`src/`）两条命令都有 HMR，保存即生效。
- 端口 3000 上如果已有实例，先确认那是你自己起的再换掉，别盲杀 PID。
- 它连的是**真实本地库** `data/ams.db`。要试删除/导入/审批这类写操作，另起一个隔离
  `DATA_DIR` 的实例，别在真实数据上试。

## 检查怎么跑：全量交给 CI

CI 有七道闸门，实测 4–6 分钟且跑在干净 runner 上；本地同样一套要 8 分钟以上。
**不要再在本地造一道全量流程**（2026-10-18 加过一次，测完当天删掉了）。

开发中按需单跑快的：`npm run typecheck`（约 60 秒）、`npm run test:run`、单个 spec。

**改用户可见的文案前**，先 grep 断言：`grep -rn "<要改的字符串>" e2e/ --include=*.ts`。
多个 e2e 用例断言的是字面文本，改文案就是改接口契约，要在同一个 commit 里把用例一起改。

## 文档里写下一个 Tailwind 类名，它就会被编进产物

Tailwind v4 默认扫描整个项目，**包括 `.md` 和 `.css` 里的字符串**。所以在设计文档里写一句
「禁止用 `ease-` 后面接方括号任意值」这种反例，反而真的把那个工具类生成出来了——禁令本身
成了隐式启用，非法写法还额外带来构建警告。

`src/index.css` 已用 `@source not` 把所有 `*.md` 与 `src/styles/transitions-tokens.css`
从类名提取里排除。要在文档/注释里举反例，只描述写法、不要完整复现那个可被提取的类名形态。

## 上线

`git push` **不会**部署任何东西。部署是在服务器上执行 `sh /opt/ams/deploy/ecs-deploy.sh`，
它会依次要求：该 commit 的 CI `verify` + `e2e` 都是 success → 构建成功 → 产物是生产构建
（`deploy/assert-prod-build.mjs`）→ 重启后健康接口通。任何一步不过就不碰线上。

完整约束（含四条只能踩出来的坑）见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 红线

- `data/`、`data-test/`、`.env*`（除 `.env.example`）不进提交；`data/ams.db` 是员工档案数据。
- `spark-output/`、`.workbuddy/`、`.design-qa/` 是设计与排查工作区，**只留本地**：仓库是公开的，
  而里面有从本地库量出来的组织事实（部门人数、数据滞后天数、哪些是测试数据）。
- 服务器地址、口令、密钥、公钥一律不进仓库。文档里用 `<服务器地址>` 占位。
- `AMS_ADMIN_PASSWORD` 不要写进会被备份/日志带走的文件；留空时应用会生成随机口令并写入
  `ADMIN_CREDENTIALS.txt`，用完删掉该文件。

## 设计债与组件（2026-10-27）

- **新代码不得新增**任意 Tailwind 值（`w-[…]`）、px 魔法数、内联样式、硬编码颜色。
- 标准动作按钮用 `ui/Button`（页面 `page` / 工具条 `toolbar` / 行内 `inline`，变体 default·outline·danger·danger-outline）；页签用 `ui/Tabs`（`TabList` + `Tab`）；卡片等复合交互用 `ui/Pressable`；筛选 chip 用 `ui/FilterChip`；表单用 `ui/Input` / `ui/Textarea`，不要再写裸 `<button>` / `<input>`。旧的 `.btn-*`、`.tab-group`/`.tab-item*` 契约类已删除，不得再引用。
- 数据表用 `ui/Table`（普通表只需 `Table`；宽表再加 `TableFrame` / `minWidth` / `StickyHeaderCell`、`StickyCell` 做首末列冻结）；不要再手写 sticky + z-index + shadow 组合，也不要把列宽总和写死成 `<table>` 的像素宽度。
- 设置二级面板用 `pages/Settings/components/SettingsPanel`：固定头部 + `.section-title`，正文默认滚动；长表用 `scroll="none"` 交给 `TableFrame` 占满剩余高度。不要再各写一套 `h-full p-6` 根节点。
- 打印/导出、虚拟滚动、图表数据驱动尺寸、用户自定义颜色属于合法例外，必须在 `design.qa.yaml` 的排除项里写明理由，不能靠注释口头豁免。
