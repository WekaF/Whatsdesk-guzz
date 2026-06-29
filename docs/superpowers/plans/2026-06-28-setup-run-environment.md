# WhatsApp Gateway — Setup & Run Environment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix missing infrastructure config and get the full stack (PostgreSQL + Redis + Go backend + React frontend) running locally on Windows.

**Architecture:** Docker Compose handles PostgreSQL (port 5433) and Redis (port 6379). Go Fiber backend on port 8000. React/Vite frontend on port 5173.

**Tech Stack:** Go 1.25, Fiber v2, GORM, whatsmeow, PostgreSQL 15, Redis 7, React 19, Vite, TailwindCSS 4, TypeScript

---

## Code Review Findings

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | `docker-compose.yml` missing PostgreSQL service | Critical | Add postgres:15-alpine on port 5433 |
| 2 | No `backend/.env` file | Critical | Create from `.env.example` with real values |
| 3 | No `frontend/.env` file | Critical | Create with API URLs |
| 4 | Redis password in docker-compose (`abdulkhafitredis`) not reflected in .env.example | High | Set `REDIS_PASSWORD` in backend/.env |
| 5 | Go not installed on this machine | Blocker | Install via `winget` |
| 6 | `CORS AllowOrigins: "*"` — fine for dev, tighten for production | Low | Document only |
| 7 | `scratch/` directory committed — utility scripts, no production risk | Info | Add to .gitignore |

---

## File Structure

- **Modify:** `docker-compose.yml` — add PostgreSQL service
- **Create:** `backend/.env` — runtime config
- **Create:** `frontend/.env` — API URL config

---

### Task 1: Update docker-compose.yml — add PostgreSQL

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add PostgreSQL service**

Replace contents with:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: whatapps-postgres
    ports:
      - "5433:5432"
    environment:
      POSTGRES_USER: whatapps
      POSTGRES_PASSWORD: whatappspassword
      POSTGRES_DB: whatapps_db
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: always

  redis:
    image: redis:7-alpine
    container_name: whatapps-redis
    ports:
      - "6379:6379"
    command: redis-server --requirepass abdulkhafitredis --save 60 1 --loglevel warning
    volumes:
      - redisdata:/data
    restart: always

volumes:
  pgdata:
  redisdata:
```

- [ ] **Step 2: Verify file**

```bash
cat docker-compose.yml
```

---

### Task 2: Create backend/.env

**Files:**
- Create: `backend/.env`

- [ ] **Step 1: Create .env**

```env
SERVER_PORT=8000

DB_HOST=localhost
DB_PORT=5433
DB_USER=whatapps
DB_PASSWORD=whatappspassword
DB_NAME=whatapps_db

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=abdulkhafitredis
REDIS_DB=0

JWT_SECRET=super-secret-key-whatsapp-gateway
UPLOAD_DIR=./uploads
```

---

### Task 3: Create frontend/.env

**Files:**
- Create: `frontend/.env`

- [ ] **Step 1: Create .env**

```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

---

### Task 4: Start Docker services

- [ ] **Step 1: Start services**

```bash
docker compose up -d
```

Expected: postgres and redis containers start.

- [ ] **Step 2: Verify**

```bash
docker compose ps
```

Expected: both containers show `running`.

---

### Task 5: Install Go

- [ ] **Step 1: Install via winget**

```powershell
winget install GoLang.Go --silent
```

- [ ] **Step 2: Reload PATH and verify**

```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
go version
```

Expected: `go version go1.25.x windows/amd64`

---

### Task 6: Build and run backend

**Files:**
- Execute in: `backend/`

- [ ] **Step 1: Download dependencies**

```bash
cd backend && go mod tidy
```

- [ ] **Step 2: Build**

```bash
go build -o server.exe ./cmd/server
```

- [ ] **Step 3: Run**

```bash
./server.exe
```

Expected: `Server listening on port :8000`

---

### Task 7: Install frontend deps and run

**Files:**
- Execute in: `frontend/`

- [ ] **Step 1: Install deps**

```bash
cd frontend && npm install
```

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

Expected: `Local: http://localhost:5173/`

---

## Default Credentials

- Backend URL: `http://localhost:8000`
- Frontend URL: `http://localhost:5173`
- Admin login: `admin@whatapps.com` / `adminpassword`
- PostgreSQL: `localhost:5433` / `whatapps:whatappspassword` / db `whatapps_db`
- Redis: `localhost:6379` / password `abdulkhafitredis`
