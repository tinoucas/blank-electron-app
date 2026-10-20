@echo off
rem Usage: bundle.cmd ^<url^>
setlocal
cd /d "%~dp0"
if "%~1"=="" (echo Usage: %~nx0 ^<url^> 1>&2 & exit /b 1)
if not "%~2"=="" (echo Usage: %~nx0 ^<url^> 1>&2 & exit /b 1)
if not exist node_modules (call npm install || exit /b 1)
node scripts\bundle.js "%~1"
