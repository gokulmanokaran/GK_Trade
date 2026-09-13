@echo off
echo ===================================================
echo   Starting OptionPulse Trading Platform
echo ===================================================
echo [1/2] Starting FastAPI Backend on http://localhost:8000 ...
start "OptionPulse Backend" cmd /k ".\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8000"

echo [2/2] Starting Next.js Frontend on http://localhost:3000 ...
cd frontend
start "OptionPulse Frontend" cmd /k "npm run dev"
cd ..

echo.
echo OptionPulse services are running:
echo   - Frontend: http://localhost:3000
echo   - Backend:  http://localhost:8000
echo   - API Docs: http://localhost:8000/docs
echo ===================================================
