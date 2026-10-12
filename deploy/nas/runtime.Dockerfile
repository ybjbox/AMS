# AMS 自更新容器的运行时镜像：node + git，应用代码由 entrypoint 在运行时拉取
#
# 与仓库根的 Dockerfile 的区别：那份把构建产物烧进镜像（发布用），
# 这份**不含应用代码** —— 代码、依赖、构建产物都在卷里，由容器自己更新。
# 这样 NAS 上不需要一个能驱动 Docker 守护进程的特权构建代理。
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install --no-install-recommends -y git ca-certificates tzdata \
  && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Shanghai
# tzdata 缺失时 TZ 会被静默忽略（等于没设）。整套业务按本地日历日判定
# （考勤归属日、合同剩余天数、提醒的"今天"），所以这里直接让构建失败说清原因。
RUN test -e /usr/share/zoneinfo/${TZ} \
  || (echo "基础镜像缺少 tzdata，无法设置 TZ=${TZ}" && exit 1) \
  && ln -snf /usr/share/zoneinfo/${TZ} /etc/localtime \
  && echo ${TZ} > /etc/timezone

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /app
ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=3000 \
  DATA_DIR=/app/data

EXPOSE 3000
# 探针看状态码：/api/health 在库不可用时返回 503，所以它能发现"进程活着但服务不可用"
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
