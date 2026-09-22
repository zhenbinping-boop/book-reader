@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   book-reader  -  dev server
echo   http://localhost:5173/
echo   Close this window or press Ctrl+C to stop.
echo ============================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found in PATH.
  echo Install Node.js, or run the bundled node/npm directly.
  pause
  exit /b 1
)

rem --open tells Vite to launch the browser once the server is ready
call npm run dev -- --open

echo.
echo Dev server stopped.
pause
