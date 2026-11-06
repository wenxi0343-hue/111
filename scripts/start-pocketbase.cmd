@echo off
setlocal

set "PROJECT_DIR=%~dp0.."
for %%I in ("%PROJECT_DIR%") do set "PROJECT_DIR=%%~fI"
set "RUNTIME_DIR=%PROJECT_DIR%\tmp\pocketbase-runtime"
set "POCKETBASE_EXE=%RUNTIME_DIR%\pocketbase.exe"
set "HTTP_ADDR=127.0.0.1:8090"

if not exist "%POCKETBASE_EXE%" (
  echo PocketBase executable not found: %POCKETBASE_EXE%
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if %ERRORLEVEL%==0 (
  echo PocketBase is already running on %HTTP_ADDR%.
  exit /b 0
)

pushd "%RUNTIME_DIR%" || exit /b 1
"%POCKETBASE_EXE%" serve --http=%HTTP_ADDR% >> "%RUNTIME_DIR%\pocketbase.out.log" 2>> "%RUNTIME_DIR%\pocketbase.err.log"
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
