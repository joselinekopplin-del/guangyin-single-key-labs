@echo off
chcp 65001 >nul
setlocal
set "MODEL_ROOT=%~dp0"
set "MODEL_BLENDER=%~1"
set "MODEL_CHECK="
if /i "%~1"=="--check" (
  set "MODEL_BLENDER="
  set "MODEL_CHECK=1"
)
if not defined MODEL_BLENDER set "MODEL_BLENDER=%BLENDER_EXE%"
if not defined MODEL_BLENDER for /f "delims=" %%B in ('where blender.exe 2^>nul') do if not defined MODEL_BLENDER set "MODEL_BLENDER=%%B"
if not defined MODEL_BLENDER for /d %%D in ("%ProgramFiles%\Blender Foundation\Blender *") do if exist "%%D\blender.exe" set "MODEL_BLENDER=%%D\blender.exe"
if not defined MODEL_BLENDER goto missing
if not exist "%MODEL_BLENDER%" goto missing
set "MODEL_CONFIG=%~2"
if not defined MODEL_CONFIG set "MODEL_CONFIG=%MODEL_ROOT%model3d\model_config.json"
if not exist "%MODEL_CONFIG%" (
  echo 模型配置不存在：“%MODEL_CONFIG%”。
  goto failed
)
if not exist "%MODEL_ROOT%model3d\build_model.py" (
  echo 缺少 model3d\build_model.py，请使用完整仓库。
  goto failed
)
set "MODEL_EXTRA="
if defined MODEL_CHECK goto check
if /i "%~3"=="--check" goto check
if /i "%~3"=="--skip-render" set "MODEL_EXTRA=--skip-render"
if not "%~3"=="" if not defined MODEL_EXTRA (
  echo 第三个参数只支持 --skip-render 或 --check。
  goto failed
)
if not exist "%MODEL_ROOT%model3d\logs" mkdir "%MODEL_ROOT%model3d\logs"
echo 使用 Blender：“%MODEL_BLENDER%”
echo 配置：“%MODEL_CONFIG%”
echo 正在生成实际模型，请等待。控制台日志：model3d\logs\last_build_console.log
"%MODEL_BLENDER%" -b --factory-startup --python-exit-code 1 --python "%MODEL_ROOT%model3d\build_model.py" -- --config "%MODEL_CONFIG%" %MODEL_EXTRA% > "%MODEL_ROOT%model3d\logs\last_build_console.log" 2>&1
if errorlevel 1 (
  type "%MODEL_ROOT%model3d\logs\last_build_console.log"
  goto failed
)
echo 生成完成。请查看 model3d\system.blend 与 showcase\models\system.glb。
echo 模型生成不等于FDTD求解；不会更新全息图、BER或其他物理性能。
exit /b 0
:check
echo 已找到 Blender、模型脚本和配置；本次只检查版本，不重新生成。
"%MODEL_BLENDER%" --version
exit /b %errorlevel%
:missing
echo 未找到 Blender，没有安装软件或创建占位模型。
echo 用法：生成模型.cmd "C:\你的Blender目录\blender.exe"
echo 也可设置 BLENDER_EXE 环境变量为已安装 Blender 的完整路径。
:failed
echo 模型生成未完成；请核对路径与日志，不要把失败当作生成成功。
pause
exit /b 1
