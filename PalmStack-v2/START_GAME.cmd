@echo off
setlocal
title Palm Stack
cd /d "%~dp0"
where py >nul 2>&1
if errorlevel 1 (
  python serve.py
) else (
  py -3 serve.py
)
pause
