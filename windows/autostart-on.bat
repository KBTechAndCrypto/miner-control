@echo off
rem Start Miner Control automatically (hidden, no window) when you log in to Windows.
rem Creates a small script in your Startup folder. Undo with autostart-off.bat.
set "VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MinerControl.vbs"
set "START=%~dp0start.bat"
for %%F in ("%START%") do set "START=%%~fF"
> "%VBS%" echo Set sh = CreateObject("WScript.Shell")
>> "%VBS%" echo sh.Run Chr(34) ^& "%START%" ^& Chr(34) ^& " hidden", 0, False
echo Autostart is on. Miner Control starts at your next login.
echo To start it right now, double-click start.bat.
pause
