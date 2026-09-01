@echo off
title LinguaPlay Immersion Player
echo ==============================================
echo 🚀 Starting LinguaPlay Multithreaded Server...
echo ==============================================
echo.

:: Navigate to script directory
cd /d "%~dp0"

:: Launch server with automatic browser opening
python Server.py --open

pause