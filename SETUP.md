# OptionPulse Setup & Installation Guide

This guide walks you through setting up OptionPulse from scratch on Windows, macOS, or Linux.

## Prerequisites

1. **Node.js** v18+ (Node.js v24.18.0 tested)
2. **Python** 3.11 or 3.12 (Python 3.12.10 tested)
3. **Git** (optional)

---

## 1. Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Default settings operate cleanly out of the box with zero external dependencies (using automated fallback to high-fidelity replay when markets are closed).

---

## 2. Python Backend Setup

### Windows:
```powershell
# 1. Create Virtual Environment
python -m venv .venv

# 2. Activate Virtual Environment
.\.venv\Scripts\Activate.ps1

# 3. Install Backend Dependencies
pip install -r requirements.txt
```

### Linux / macOS:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## 3. Frontend Setup

```bash
cd frontend
npm install
cd ..
```

---

## 4. Database Setup

OptionPulse automatically checks and seeds all 16 database tables upon application startup!

- **Local / Development Mode**: Uses `sqlite+aiosqlite:///./optionpulse.db` by default.
- **Production PostgreSQL Mode**: Set `DATABASE_URL=postgresql+asyncpg://username:password@localhost:5432/optionpulse_db` in `.env`.
- **SQL Schema Script**: Found in `database/schema.sql` for manual DDL deployments.

---

## 5. Running the Application

### Option A: Run with the Windows Helper Script
```powershell
.\run.bat
# or
.\run.ps1
```

### Option B: Run in Separate Terminals

**Terminal 1 (Backend - Port 8000):**
```powershell
.\.venv\Scripts\uvicorn.exe backend.main:app --reload --port 8000
```

**Terminal 2 (Frontend - Port 3000):**
```powershell
npm run dev --prefix frontend
```

Visit **http://localhost:3000** in your browser.

---

## 6. Running Automated Test Suite

```powershell
.\.venv\Scripts\pytest.exe tests/ -v
```
