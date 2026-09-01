@echo off
title LinguaPlay Hybrid Server
echo ==============================================
echo 🚀 Starting LinguaPlay Local Server and App...
echo ==============================================
echo.

:: This launches your browser automatically after a 1-second delay
start /b cmd /c "timeout /t 1 >nul & start http://127.0.0.1:8000/App.html"

:: This starts your Python server and keeps the window open
python server.py

pause