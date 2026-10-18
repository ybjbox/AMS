# 部署方式

> 本文只写方式、命令与约束。**地址、口令、密钥一律不进仓库**——它们在本机的 `.env.local`
> 和服务器上的 `/etc/ams/env` 里，两者都被 `.gitignore` 挡住。文中出现的 `<服务器地址>`
> 是占位符，不是待填的 TODO。

## 现状

线上是**华为云 ECS 上的裸机单进程**（2026-10-18 起，真实库同日迁入）。飞牛 NAS 那套自更新
容器仍然完整可用但已停职；单容器镜像适合任何"给我一台能跑 Docker 的机器"的场合。

| 方式 | 代码位置 | 什么时候用 |
| --- | --- | --- |
| 裸机单进程 | 本文 | 当前线上 |
| 单容器全栈镜像 | 根目录 `Dockerfile` + `docker-compose.yml`，说明见 `docs/DOCKER.md` | 一次性部署到任意有 Docker 的机器；产物烧进镜像 |
| NAS 自更新容器 | `deploy/nas/` | 需要"`git push` 即上线"且机器上不能装反代 |

三种跑法共用同一个进程模型：Express 直接托管 `dist/` 静态产物，**没有 nginx**，一个端口出去。

## 裸机运行环境

- **Node ≥ 22.9**（`engines` 要求）。数据库用内置 `node:sqlite`，全仓零原生模块，不需要编译工具链。
- 运行只需要 `dependencies` 那 14 个包（`tsx` 在里面）；**构建**才需要 devDependencies。
- 起进程：`node --import tsx server.ts`。`HOST` 默认 `127.0.0.1`——不设成 `0.0.0.0` 就只对
  本机可见，这是刻意的默认值，别把它当 bug 改掉。
- `NODE_ENV=production` **必须显式设**。[server.ts](../server.ts) 里 `NODE_ENV !== "production"`
  会去懒加载 vite 并挂 dev middleware，于是发给用户的是源码态页面（`/@vite/client`）而不是
  打包产物，首屏慢两个数量级。

### 目录与单元（当前线上）

```
/opt/ams                    代码，root 所有、进程只读
/var/lib/ams                DATA_DIR，属主 ams:ams，模式 750
/etc/ams/env                环境变量，root:ams 640，刻意不含任何口令
/etc/systemd/system/ams.service   User=ams + ProtectSystem=strict + ReadWritePaths=/var/lib/ams
```

`ADMIN_CREDENTIALS.txt` 只在 `AMS_ADMIN_PASSWORD` 留空时生成（随机口令 + 首次登录强制改），
用完就该删；口令写进 env 文件等于写进备份和日志。

## 日常更新

```
改代码 → npm 单道自查 → git push → 等 CI 绿 → 服务器上执行 deploy/ecs-deploy.sh
```

**本地不跑全量。** CI 七道（类型 → lint → 单元 → 服务端回归 → 构建 → 产物验货 → E2E）实测
4.2–6.1 分钟且跑在干净 runner 上；本地同样一套要 8.4 分钟。开发过程中按需单跑
`npm run typecheck` / `test:run` / 单个 spec 就够。

`deploy/ecs-deploy.sh` 在 `systemctl restart` 之前问三句话，任何一句不过就不动线上：

1. **`deploy/ci-gate.mjs`**：这个 commit 的 `verify` 与 `e2e` 在 GitHub 上都是 `success` 吗？
   查不到、没跑完、API 出错，一律按不放行处理。紧急救火用 `ALLOW_UNVERIFIED=1` 显式越过，
   会在日志里留下警告。
2. `npm run build` 成功退出。
3. **`deploy/assert-prod-build.mjs`**：成品是生产构建吗？判三条——有 `Minified React error`、
   无 `react-dom.development`、`index.html` 不含 dev 入口。

同一道验货也挂在 CI 的构建步骤之后。它拦的是"功能测试一条都不会红"的那类回归：
`NODE_ENV` 一旦是 development，vite 会把 dev-only 的 UI 分支折进包里。2026-10-18 就这么把
一个调试版发到过公网，当时六道闸门全绿。

## 四条实测约束（改脚本前先读）

1. **`npm ci` 要 `NODE_ENV=development`，`npm run build` 要 `production`。** npm v9+ 会按
   `NODE_ENV=production` 自行推导 `--omit=dev`，768 个 dev 包一个都不装，`vite` 直接找不到。
   所以两条命令的 env 必须分开写，**不能在脚本顶部 `export`**——顶部 export 过一次，
   结果构建也进了开发模式。
2. **小内存机器上 vite build 会 OOM。** 800 MB 的机器上 V8 把堆上限压到约 400 MB，构建在
   15 秒处 `Reached heap limit` 自杀。这不是内存不足（当时还有 557 MB 可用、swap 只用 12 MB），
   加 swap 也治不了——堆上限是 V8 硬闸门。解法是 `NODE_OPTIONS=--max-old-space-size=1024`。
3. **境内服务器到 github 的 git 通道间歇性不可用**，不是"浅克隆就能过"那么乐观。实测某一时段
   同一台机器：HTTP/2 **0/5** 成功、HTTP/1.1 **2/5** 成功，失败形态包括 `expected flush after
   ref listing`、`GnuTLS recv error (-110)`、`Failed to connect to github.com port 443`。
   而 git 默认单次连接要 130 秒才放弃。`ecs-deploy.sh` 的对策是：`--depth=1` + HTTP/1.1 +
   `GIT_HTTP_LOW_SPEED_TIME=20` 快速失败 + 最多 10 次退避重试，全失败就放弃且**不碰线上**。
   `api.github.com` 不受影响，所以 CI 闸门照常可靠。
4. **systemd 里 `EnvironmentFile=` 覆盖同名 `Environment=`。** 想用 drop-in 临时改 `HOST`
   会不生效，进程拿到的是文件里的值——真实数据曾经因此对公网开放了一次。**改绑定只能改
   env 文件本身**，且改完必须从外部 `curl` 复测，不能只看 `ss` 或配置文件。

## 数据

数据与代码完全分开：部署只换代码，不碰 `DATA_DIR`。

- 备份是单个 `ams-<时间戳>.zip`（manifest + 库 + uploads 快照 + 模板快照），由 `VACUUM INTO`
  热拷贝产生，不影响正在跑的进程。旧的 `.db` + 侧目录形态仍可读，但不再产生。
- 自动备份默认每 24 小时一次，保留 7 天 / 14 份 / 总量上限。上限要按**该卷实际可用空间**设，
  别拿多卷合计值当单卷。
- **跨机迁移走界面**：源机「设置 → 备份 → 立即备份 → 导出」，目标机把 zip 放进
  `DATA_DIR/backups/`（或用「导入备份」上传），再点恢复。恢复走
  `restoreBackup()`，内含 `PRAGMA integrity_check`、恢复前自动打一份安全备份、
  原子 rename、补齐迁移、确认回到 WAL 模式。
- 停服恢复：`systemctl stop ams` 后以运行用户身份执行恢复，避免 root 写出属主错误的文件
  把服务卡死。
- 同一个 `DATA_DIR` 上不要同时跑两个实例：恢复备份会被拒 409（`server/instanceLock.ts`），
  这是设计意图——否则另一台的写入会静默落到已被替换的库上。

## 已知缺口

- **ECS 这条链没有自动回滚。** `npm run build` 就地覆盖 `dist/`，构建中途失败会留下半个产物
  目录，而进程还在跑。目前靠"CI 绿 + 验货在 restart 之前"**拦在前面**，不是摔了能爬起来。
  NAS 那套有回退（构建失败自动用上一个 commit 重建），裸机这套要补的话，做法是先构建到新
  目录、验货通过再整目录换名。
- **无 TLS、无 helmet、无全局限速。** 明文 HTTP 上跑 `Authorization: Bearer` 是当前方案的
  固有代价，需要域名/证书才能消除。已有的缓解是账号级锁定：5 次失败锁 60 秒，指数递增，
  上限 30 分钟（`server/authDb.ts`）。
- **备份不出机器。** 除非把 zip 导出到别处，否则"每日备份"和线上库在同一块盘上，不构成第二副本。
