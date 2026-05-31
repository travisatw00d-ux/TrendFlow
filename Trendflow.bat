@echo off
title Trendflow

echo Starting backend...
cd /d "%~dp0backend"
start "Trendflow-Backend" cmd /c "python app.py"

echo Starting frontend...
cd /d "%~dp0frontend"
start "Trendflow-Frontend" cmd /c "npm run dev"

echo Trendflow is starting...
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:3000
echo.
echo Close this window to stop both servers.
pause
