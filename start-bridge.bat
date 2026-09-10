@echo off
title HOTELIER print bridge
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Install it from https://nodejs.org  ^(LTS^), then run this again.
  pause
  exit /b 1
)
echo Starting HOTELIER print bridge... leave this window open.
node src\index.js
pause
