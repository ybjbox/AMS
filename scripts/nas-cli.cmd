@echo off
rem 飞牛 NAS 命令行包装：连接参数不写死在这里 —— 内网地址只存在于 .env.local（不进仓库）
rem 用法：scripts\nas-cli.cmd docker container ls
rem .env.local 里配置：NAS_HOST=<NAS 的内网地址>  NAS_PORT=5667  NAS_PROFILE=ams-nas
rem 也可以先用环境变量覆盖：set NAS_HOST=10.0.0.9 后调用（已设过的不会被 .env.local 盖掉）
setlocal enabledelayedexpansion
set "TRIM_CLI=C:\Users\Administrator\.qoder-cn\skills\fnos\bin\trim-cli-windows-x64.exe"
set "ENV_FILE=%~dp0..\.env.local"
if not exist "%TRIM_CLI%" (
  echo 找不到 trim-cli：%TRIM_CLI%
  exit /b 1
)
if not exist "%ENV_FILE%" (
  echo 找不到 %ENV_FILE%，无法取 NAS 地址；在 .env.local 里加一行 NAS_HOST=...
  exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%K in (`findstr /b "NAS_HOST= NAS_PORT= NAS_PROFILE=" "%ENV_FILE%"`) do (
  if not defined %%K set "%%K=%%L"
)

if not defined NAS_HOST (
  echo .env.local 里没有 NAS_HOST，无法确定 NAS 地址
  exit /b 1
)
if not defined NAS_PORT set "NAS_PORT=5667"
if not defined NAS_PROFILE set "NAS_PROFILE=ams-nas"

"%TRIM_CLI%" --profile !NAS_PROFILE! --host !NAS_HOST! --port !NAS_PORT! --scheme https --tls-insecure %*
exit /b %errorlevel%
