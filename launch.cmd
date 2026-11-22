@echo off
rem Gets the newest Hive code and starts the app. See scripts/start.ts.
cd /d "%~dp0"
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts\start.ts %*
exit /b %errorlevel%
