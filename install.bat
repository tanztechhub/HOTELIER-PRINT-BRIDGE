@echo off
setlocal
title HOTELIER print bridge - install

set "APPDIR=%LOCALAPPDATA%\HotelierPrintBridge"
set "EXE=%~dp0hotelier-print-bridge.exe"
set "CFG=%~dp0agent-config.json"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

if not exist "%EXE%" (
  echo Could not find hotelier-print-bridge.exe next to this script.
  pause
  exit /b 1
)

echo Installing to "%APPDIR%" ...
if not exist "%APPDIR%" mkdir "%APPDIR%"
copy /Y "%EXE%" "%APPDIR%\hotelier-print-bridge.exe" >nul
if exist "%CFG%" (
  echo Copying agent-config.json ...
  copy /Y "%CFG%" "%APPDIR%\agent-config.json" >nul
)

echo Adding a Startup shortcut ...
powershell -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%STARTUP%\HOTELIER Print Bridge.lnk');" ^
  "$s.TargetPath='%APPDIR%\hotelier-print-bridge.exe';" ^
  "$s.WorkingDirectory='%APPDIR%';" ^
  "$s.WindowStyle=7;" ^
  "$s.Description='HOTELIER receipt printing bridge';" ^
  "$s.Save()"

echo Starting it now ...
start "" "%APPDIR%\hotelier-print-bridge.exe"

echo.
echo Done. The bridge is running and will start automatically at login.
echo In HOTELIER: Settings -> Receipt Printer -> Connection type = Local print bridge.
echo For automatic dispatch printing, edit "%APPDIR%\agent-config.json" and restart the bridge.
pause
