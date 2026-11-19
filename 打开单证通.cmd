@echo off
chcp 65001 >nul
setlocal
set "DIR=%~dp0"
if exist "%DIR%dist\单证通-外贸单证系统.html" (
  start "" "%DIR%dist\单证通-外贸单证系统.html"
) else (
  start "" "%DIR%index.html"
)
endlocal
