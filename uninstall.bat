@echo off
setlocal
title HOTELIER print bridge - uninstall

set "APPDIR=%LOCALAPPDATA%\HotelierPrintBridge"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo Stopping the bridge ...
taskkill /F /IM hotelier-print-bridge.exe >nul 2>&1

echo Removing the Startup shortcut ...
del /Q "%STARTUP%\HOTELIER Print Bridge.lnk" >nul 2>&1

echo Removing "%APPDIR%" ...
rmdir /S /Q "%APPDIR%" >nul 2>&1

echo.
echo Done.
pause
