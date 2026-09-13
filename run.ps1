Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Starting OptionPulse Trading Platform" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

Write-Host "[1/2] Starting FastAPI Backend on http://localhost:8000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '.\.venv\Scripts\python.exe' -m uvicorn backend.main:app --reload --port 8000"

Write-Host "[2/2] Starting Next.js Frontend on http://localhost:3000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host ""
Write-Host "OptionPulse services are launching:" -ForegroundColor Yellow
Write-Host "  - Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "  - Backend:  http://localhost:8000" -ForegroundColor White
Write-Host "  - API Docs: http://localhost:8000/docs" -ForegroundColor White
Write-Host "===================================================" -ForegroundColor Cyan
