@echo off
rem Start Miner Control without Docker (Windows).
rem Needs Node.js 18 or newer (https://nodejs.org). Open http://localhost:18090 afterwards.
rem Settings are variables - all optional. Remove "rem " in front of a line to use it.
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 goto nonode

if not defined PORT set PORT=18090
if not defined DATA_DIR set DATA_DIR=%CD%\data
if not defined MC_LANG call :detectlang
rem set CKPOOL_DIR=C:\path\to\ckpool

echo Miner Control: http://localhost:%PORT%   (data in %DATA_DIR%)
node app\server.js
if /i not "%~1"=="hidden" pause
goto :eof

:nonode
echo Node.js 18 or newer is required: https://nodejs.org
pause
goto :eof

:detectlang
rem start language for a new installation: German Windows -> de, otherwise en (switchable in the page header)
set MC_LANG=en
for /f "delims=" %%i in ('powershell -NoProfile -Command "(Get-Culture).TwoLetterISOLanguageName" 2^>nul') do if /i "%%i"=="de" set MC_LANG=de
goto :eof
