@echo off
chcp 65001 >nul
setlocal
set "PREVIEW_NODE=%GUANGYIN_NODE_EXE%"
if not defined PREVIEW_NODE for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined PREVIEW_NODE set "PREVIEW_NODE=%%N"
if not defined PREVIEW_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "PREVIEW_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined PREVIEW_NODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PREVIEW_NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined PREVIEW_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "PREVIEW_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined PREVIEW_NODE goto missing
if not exist "%PREVIEW_NODE%" goto missing
"%PREVIEW_NODE%" "%~dp0tools\preview-3d.cjs" "%~1"
if errorlevel 1 goto failed
exit /b 0
:missing
echo 未找到可用的 Node.js。没有自动安装软件。
echo 请设置 GUANGYIN_NODE_EXE 为已安装 node.exe 的完整路径，再运行本文件。
echo 也可按“三维展示使用说明.md”使用已有 Python 的 HTTP 服务。
:failed
echo.
echo 预览启动未完成，请查看上方错误。不会启动 Blender 或 FDTD。
pause
exit /b 1
