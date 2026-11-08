@echo off
rem Remove the automatic start of Miner Control. A running instance keeps running until you
rem log off or end the "node.exe" process in Task Manager.
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\MinerControl.vbs"
echo Autostart is off.
pause
