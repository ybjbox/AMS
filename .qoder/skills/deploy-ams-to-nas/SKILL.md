---
name: deploy-ams-to-nas
description: 把 AMS 部署/更新到飞牛 NAS（fnOS）的 Docker 上，并处理部署相关的 trim-cli 调用。当用户提到"部署到 NAS""飞牛""NAS 上的 AMS 挂了/更新了""看 NAS 的容器/日志""回滚线上版本"时使用。含本环境实测过的连接方式、上传命令、状态核对与已知坑（Git Bash 路径转换、compose 写端点无 schema、编排文件名）。
---

# AMS → 飞牛 NAS 部署

## 这套东西长什么样

NAS 上只有一个容器 `ams`（compose 项目名 `ams`，目录 `/vol1/1000/Docker/ams`）。它**自更新**：
容器内的 `entrypoint.sh` 每 `INTERVAL_SECONDS`（默认 300s）问一次 GitHub，发现 `origin/main`
有新提交就 `git checkout` → `npm ci` → `npm run build` → 重启 node 进程。

- 没有特权容器、不挂 `docker.sock`、不需要镜像仓库。
- 构建失败**不动**在跑的进程；新版本起不来会自动退回上一个 sha。
- 代码在卷 `ams-code:/app`，npm 缓存在卷 `ams-npm:/root/.npm`。
- **数据是宿主目录**：`/vol1/1000/Docker/ams/data → /app/data`（SQLite 库、每日备份、
  上传的图片、打印模板）。学的是 MoviePilot 的 `/config`：在飞牛文件管理器里直接可见，
  所以"手工拷一份去别的盘/网盘"做得到，容器起不来时也拿得到 `ams.db`。
  回滚、重建容器、换代码都不碰这个目录。

日常动作只有一个：`git push` 到 `main`。

## 连接参数

包装脚本 `scripts/nas-cli.cmd` 从 **`.env.local`** 读 `NAS_HOST` / `NAS_PORT` / `NAS_PROFILE`
（内网地址只在那儿，不进仓库），固定用 `--scheme https --tls-insecure`（fnOS 是自签证书）。
优先用它，别手敲一长串：

```
scripts\nas-cli.cmd docker compose ls
```

口令只存在于 NAS 的 `/vol1/1000/Docker/ams/.env`（`AMS_ADMIN_PASSWORD=...`），不进仓库、
不进聊天。OAuth session 由 trim-cli 自己保管在 `~/.config/trim-cli/profiles/`，
过期用 `scripts\nas-cli.cmd login --refresh` 续；续不动就要用户本人重新 `login`
（技能规定 Agent 不代填凭据、不读一次性 code）。

## 已踩过的坑（都是本机实测）

1. **Git Bash 会把 `/vol1/...` 转换成本地路径**，直连 exe 时报 `Unsupported path`，走
   `cmd //c` 时会被改写成 `C:\Program Files\Git\vol1\...`（空格还把参数劈成两半）。
   **凡是参数里带 NAS 绝对路径**（`file upload/ls`、任何 `--json` 里含 `/vol1`）就用这一种形式：
   `MSYS_NO_PATHCONV=1 cmd /c "scripts\\nas-cli.cmd ..."` —— 注意是 `/c` 单反杠；
   写成 `//c` 加上 `MSYS_NO_PATHCONV=1` 会让 cmd 收到非法开关，只打出 banners 什么也不干。
   参数里没有 `/vol1` 时（`docker container ls`、`file ls` 之外的绝大多数）`cmd //c` 正常可用。
2. **`--overwrite` 的取值是 `skip|replace|rename`**，不是布尔。写操作一律要 `--yes`。
3. **子命令名不要猜**：删镜像是 `docker image rm`（不是 `remove`）；`file upload <远端目录> <本地文件>`
   落地文件名**取本地文件名** —— 想传成 `docker-compose.yml` 就得先让本地文件叫这个名字，
   从 `/tmp/dc.yml` 上传会得到一个 `dc.yml`。
4. **改了部署方案要回头清 NAS 侧残留**：换成自更新容器后，为旧方案预拉的 `docker:27-cli`
   （194 MB）在 NAS 上挂了半天才删掉。上传过的文件、预拉的镜像、建过的项目都算残留。
5. NAS 侧的编排文件名必须是 **`docker-compose.yml`**（现有 10 个项目都是这个名），
   仓库里那份叫 `deploy/nas/compose.yml`，上传时要改名 —— 面板按前者找。
6. **`docker container ls` 的 Ports 列不能用来判断端口空不空**：跑 `network_mode: host` 的
   容器（本机 MoviePilot、airconnect、homeassistant）在该列是**空白**的。第一次部署就因此
   把 AMS 写成 `3000:3000`，起容器才报 `address already in use` —— 3000 其实是 MoviePilot 的
   nginx。现在宿主端口是 **3100**（`docker-compose.yml` 里 `3100:3000`，容器内仍是 3000）。
   挑端口前先直接探一次：
   `node -e "net.connect({host:NAS_HOST,port:P,timeout:1200},()=>console.log('占用')).on('error',()=>console.log('空闲'))"`。
7. **`containerRemove` 认容器名，不认 id**：传 64 位 id 或 12 位短 id 都是 `errno 52428814`，
   传 `{"containerId":"ams","force":true}` 才回 `"ok"`。删不掉的容器会占住端口占用判断，
   遇到 `address already in use` 又确认宿主没人用时，先按名字删。
8. **compose 系列端点的入参一个都猜不出来**：`composeContainers` 用 `name` / `projectName` /
   `project` / `composeName` / 加 `folder` 全是 `errno 52428803`（参数无效）。别再花时间试了，
   项目级的启动/更新只在面板做。只读探测 `docker request` 也要带 `--yes`，否则 CLI 本地就拦下。

## 常用操作

```bash
# 状态与健康
scripts\nas-cli.cmd docker compose ls                 # 看 ams 项目的 running/total
scripts\nas-cli.cmd docker container ls --all         # 看容器状态（含 stopped）
scripts\nas-cli.cmd docker container inspect <id>     # State.Running / 端口映射

# 删掉建失败的容器（端口占位/名字冲突时用；值必须是容器名，传 id 得 errno 52428814）
scripts\nas-cli.cmd docker request appcgi.dockermgr.containerRemove --json '{"containerId":"ams","force":true}' --yes

# 看部署日志（entrypoint 会写"发现新版本 / 已上线 / 构建失败 / 回滚"）
# 参数键是 containerId（写 id 会被设备拒掉：errno 52428803）；值可以用容器名
scripts\nas-cli.cmd docker request appcgi.dockermgr.containerLogs --json '{"containerId":"ams","tail":200}' --yes

# 改了 deploy/nas 下的文件后重新上传（NAS 侧是平铺布局，编排文件必须叫 docker-compose.yml）
export MSYS_NO_PATHCONV=1        # 不加这条，Git Bash 会把 /vol1/... 换成本地路径
scripts\nas-cli.cmd file upload /vol1/1000/Docker/ams E:/AMS/deploy/nas/entrypoint.sh --yes --overwrite replace
# 改了 compose.yml 要传两次（同一份内容、两个名字）：
#   file upload .../ E:/AMS/deploy/nas/compose.yml        → compose.yml
#   本地先 cp 成 docker-compose.yml 再上传                 → 面板认的是这个名
```

上传后要让容器重新读一次脚本：`containerStop` + `containerStart`（卷里的代码不受影响，
但 `entrypoint.sh` 是烧在镜像里的 —— 改了它必须 `docker compose build` 重建镜像，
这一步只能走飞牛面板，见下）。

## 首次建项目 / 改了 runtime.Dockerfile：只能走面板

`appcgi.dockermgr.*` 里 compose 只有 `composeList / composeContainers / composeCreate /
composeStart / composeStop`，**没有 composeCreate 的入参 schema，也没有 composeRemove**。
用猜的 payload 建错项目无法用 CLI 删除，所以这两件事固定在飞牛 Web 面板做（用户本人操作）：

1. Docker → 编排/Compose → 新建项目 → 目录选 `/vol1/1000/Docker/ams` → 构建并启动。
2. 改了 `runtime.Dockerfile` 或 `entrypoint.sh` 后，同样在面板里对该项目"重新构建"。

其余（看状态、看日志、启停、上传文件）都能用 CLI。

## 验证一次部署是否成功

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://<NAS_HOST>:3100/api/health"   # 期望 200；地址取 .env.local 的 NAS_HOST
```

再看容器日志里的 `已上线 <sha10>`，sha 应与 `git log -1 --format=%h origin/main` 对得上。

## 回滚线上版本

entrypoint 的自动回滚只在"新版本起不来"时生效。人工回滚（版本起得来但行为不对）：
在面板里停容器 → 用 `file` 把 `/app/.deployed-sha` 所在卷清掉不可行（卷不对外），
实际可行做法是**在 GitHub 上把 main 回退到目标提交并 push**（`git revert`，不要用
`reset --hard` 推共享分支），容器下一轮会自动装回去。这条是有意为之：线上版本永远等于 main。
