# whatdesks ↔ mellyna-education Integration + VPS Deployment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Waha (WhatsApp HTTP API Docker container) in mellyna-education with whatdesks (native whatsmeow Go backend), then deploy whatdesks on a VPS so both projects share one WhatsApp gateway.

**Architecture:** mellyna-education's `lib/waha.ts` is rewritten in-place to call the whatdesks REST API instead of Waha — all 12+ import paths stay unchanged. whatdesks runs on VPS in Docker (postgres + redis + Go backend + nginx serving React frontend). mellyna-education points `WHATDESKS_BASE_URL` at the VPS URL.

**Tech Stack:** Go + Fiber (whatdesks backend), React + Vite (whatdesks frontend), PostgreSQL 15, Redis 7, Nginx, Docker + docker-compose, TypeScript (mellyna adapter)

---

## Why this approach

| | Waha | whatdesks |
|---|---|---|
| Protocol | HTTP API → Waha docker → WA Web | Native whatsmeow (WA Multi-Device protocol) |
| Auth | Static `X-Api-Key` header | JWT Bearer token (72h TTL, refreshed automatically) |
| Send text | `POST /api/sendText` | `POST /api/messages/send` |
| Send file | `POST /api/sendFile` (base64 in JSON) | Upload → `POST /api/messages/upload` (multipart) → send with `media_url` |
| Session status | `GET /api/sessions/{session}` | `GET /api/devices/{uuid}` |
| Self-hosted | Yes (Docker) | Yes (Docker, this plan) |

The adapter in mellyna-education translates the 3 public functions (`sendWhatsApp`, `sendWhatsAppFile`, `getSessionStatus`) so **zero caller code changes** are required — only `lib/waha.ts` body changes.

---

## File Structure

### mellyna-education changes
- **Modify:** `lib/waha.ts` — rewrite body to call whatdesks API; keep exports identical
- **Modify:** `.env.example` — replace `WAHA_*` vars with `WHATDESKS_*` vars
- **Update tests:** `__tests__/lib/waha-file.test.ts` — mock path stays `@/lib/waha`, but update env vars in test setup

### whatdesks VPS deployment (new files)
- **Create:** `backend/Dockerfile` — Go multi-stage build
- **Create:** `frontend/Dockerfile` — Node build + nginx static serve
- **Create:** `docker-compose.prod.yml` — all 5 services (postgres, redis, backend, frontend, nginx-proxy)
- **Create:** `nginx.docker.conf` — nginx config for Docker deployment (upstream = `backend:8000`)
- **Create:** `.env.prod.example` — production environment template

---

## Task 1: Rewrite `lib/waha.ts` in mellyna-education

**Files:**
- Modify: `C:\Users\weka\Learning\mellyna-education\lib\waha.ts`

This is a drop-in replacement. All exported function signatures stay identical. All 12 importing files need zero changes.

**Env vars used** (configure in mellyna-education `.env`):
```
WHATDESKS_BASE_URL=http://your-vps-ip:8005
WHATDESKS_EMAIL=admin@example.com
WHATDESKS_PASSWORD=your-password
WHATDESKS_DEVICE_ID=1
WHATDESKS_DEVICE_UUID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

- [ ] **Step 1: Write new `lib/waha.ts`**

Replace the entire file with:

```typescript
// WhatsApp adapter — calls whatdesks API instead of Waha.
// Exports are identical to the original waha.ts so all callers stay unchanged.

const BASE = process.env.WHATDESKS_BASE_URL ?? 'http://localhost:8000'
const EMAIL = process.env.WHATDESKS_EMAIL ?? ''
const PASSWORD = process.env.WHATDESKS_PASSWORD ?? ''
const DEVICE_ID = parseInt(process.env.WHATDESKS_DEVICE_ID ?? '1', 10)
const DEVICE_UUID = process.env.WHATDESKS_DEVICE_UUID ?? ''

// JWT token cache — login once, reuse for ~60 hours, refresh before expiry
let _token: string | null = null
let _tokenExpiry = 0

async function getToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry) return _token
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`[WHATDESKS] login failed ${res.status}: ${body}`)
  }
  const data = await res.json()
  _token = data.token as string
  _tokenExpiry = Date.now() + 60 * 60 * 1000 * 60 // cache 60 h (JWT TTL is 72 h)
  return _token!
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^0/, '62')
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function randomDelay(minMs = 3000, maxMs = 7000): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
}

export async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  try {
    const token = await getToken()
    const res = await fetch(`${BASE}/api/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        device_id: DEVICE_ID,
        phone: normalizePhone(phone),
        message,
        message_type: 'text',
      }),
    })
    if (!res.ok) {
      if (res.status === 401) _token = null // force re-login next call
      const body = await res.text().catch(() => '(no body)')
      console.error(`[WHATDESKS] sendText failed ${res.status} for ${phone}: ${body}`)
      return false
    }
    return true
  } catch (e) {
    console.error('[WHATDESKS] sendText error:', e)
    return false
  }
}

export async function sendWhatsAppFile(
  phone: string,
  base64Data: string,
  filename: string,
  mimetype: string,
  caption: string
): Promise<boolean> {
  try {
    const token = await getToken()

    // Step 1: convert base64 → Blob → multipart upload
    const binary = Buffer.from(base64Data, 'base64')
    const blob = new Blob([binary], { type: mimetype })
    const form = new FormData()
    form.append('file', blob, filename)

    const uploadRes = await fetch(`${BASE}/api/messages/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    if (!uploadRes.ok) {
      if (uploadRes.status === 401) _token = null
      const body = await uploadRes.text().catch(() => '(no body)')
      console.error(`[WHATDESKS] upload failed ${uploadRes.status}: ${body}`)
      return false
    }
    const { url, message_type } = (await uploadRes.json()) as {
      url: string
      message_type: string
    }

    // Step 2: send message referencing the uploaded file
    const sendRes = await fetch(`${BASE}/api/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        device_id: DEVICE_ID,
        phone: normalizePhone(phone),
        message: caption,
        message_type,
        media_url: url,
        file_name: filename,
      }),
    })
    if (!sendRes.ok) {
      if (sendRes.status === 401) _token = null
      const body = await sendRes.text().catch(() => '(no body)')
      console.error(`[WHATDESKS] sendFile failed ${sendRes.status} for ${phone}: ${body}`)
      return false
    }
    return true
  } catch (e) {
    console.error('[WHATDESKS] sendFile error:', e)
    return false
  }
}

// Returns Waha-compatible status strings so callers that check 'WORKING' keep working
export async function getSessionStatus(): Promise<string> {
  try {
    const token = await getToken()
    const res = await fetch(`${BASE}/api/devices/${DEVICE_UUID}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return 'UNKNOWN'
    const data = (await res.json()) as { status: string }
    // whatdesks statuses: CONNECTED / DISCONNECTED / CONNECTING
    return data.status === 'CONNECTED' ? 'WORKING' : 'STOPPED'
  } catch {
    return 'OFFLINE'
  }
}
```

- [ ] **Step 2: Verify existing tests still mock correctly**

The test files mock `@/lib/waha` module — path unchanged, so Jest mock resolution still works. No test file changes needed. Run:

```bash
cd C:\Users\weka\Learning\mellyna-education
npx jest --testPathPattern="waha-file" --no-coverage
```

Expected: PASS (mocked module, no real network call)

- [ ] **Step 3: Commit**

```bash
cd C:\Users\weka\Learning\mellyna-education
git add lib/waha.ts
git commit -m "feat: replace Waha with whatdesks adapter in lib/waha.ts"
```

---

## Task 2: Update mellyna-education env vars

**Files:**
- Modify: `C:\Users\weka\Learning\mellyna-education\.env.example`

- [ ] **Step 1: Update `.env.example`**

Remove the three `WAHA_*` lines and add five `WHATDESKS_*` lines:

```diff
- WAHA_BASE_URL="http://localhost:3001"
- WAHA_API_KEY="mellyna-waha-secret"
- WAHA_SESSION="default"
+ WHATDESKS_BASE_URL="http://your-vps-ip:8005"
+ WHATDESKS_EMAIL="admin@whatdesks.local"
+ WHATDESKS_PASSWORD="change-me"
+ WHATDESKS_DEVICE_ID=1
+ WHATDESKS_DEVICE_UUID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

- [ ] **Step 2: Update your actual `.env` file** (not committed) with real VPS values from Task 6

- [ ] **Step 3: Commit**

```bash
cd C:\Users\weka\Learning\mellyna-education
git add .env.example
git commit -m "chore: replace WAHA_* env vars with WHATDESKS_* in .env.example"
```

---

## Task 3: Create `backend/Dockerfile`

**Files:**
- Create: `C:\Users\weka\Learning\whatdesks\backend\Dockerfile`

- [ ] **Step 1: Write Dockerfile**

```dockerfile
# Stage 1: build
FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /server ./cmd/server

# Stage 2: runtime
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /server ./server
COPY migrations ./migrations
RUN mkdir -p uploads
EXPOSE 8000
CMD ["./server"]
```

- [ ] **Step 2: Verify build locally (optional)**

```bash
cd C:\Users\weka\Learning\whatdesks\backend
docker build -t whatdesks-backend .
```

Expected: image built successfully, `whatdesks-backend:latest` in `docker images`

- [ ] **Step 3: Commit**

```bash
cd C:\Users\weka\Learning\whatdesks
git add backend/Dockerfile
git commit -m "feat: add Go multi-stage Dockerfile for backend"
```

---

## Task 4: Create `frontend/Dockerfile`

**Files:**
- Create: `C:\Users\weka\Learning\whatdesks\frontend\Dockerfile`

- [ ] **Step 1: Write Dockerfile**

```dockerfile
# Stage 1: build React app
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
# VITE_API_URL and VITE_WS_URL are baked in at build time via ARG
ARG VITE_API_URL=http://localhost:8005
ARG VITE_WS_URL=ws://localhost:8005
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
RUN npm run build

# Stage 2: serve with nginx
FROM nginx:1.25-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.docker.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 2: Commit**

```bash
cd C:\Users\weka\Learning\whatdesks
git add frontend/Dockerfile
git commit -m "feat: add Node multi-stage Dockerfile for frontend"
```

---

## Task 5: Create `nginx.docker.conf`

**Files:**
- Create: `C:\Users\weka\Learning\whatdesks\frontend\nginx.docker.conf`

This nginx config runs inside the **frontend container** and proxies `/api/`, `/auth/`, `/uploads/`, `/devices/` to the backend service named `backend` in docker-compose.

- [ ] **Step 1: Write nginx.docker.conf**

```nginx
upstream backend_server {
    server backend:8000;
    keepalive 32;
}

server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    gzip on;
    gzip_proxied any;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
    gzip_comp_level 5;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # React SPA
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Auth API
    location /auth/ {
        proxy_pass http://backend_server;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # REST API
    location /api/ {
        proxy_pass http://backend_server;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket (device QR pairing)
    location /devices/ {
        proxy_pass http://backend_server;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Uploaded media — served from Docker volume
    location /uploads/ {
        alias /app/uploads/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
        try_files $uri =404;
    }
}
```

- [ ] **Step 2: Commit**

```bash
cd C:\Users\weka\Learning\whatdesks
git add frontend/nginx.docker.conf
git commit -m "feat: add nginx config for frontend Docker container"
```

---

## Task 6: Create `docker-compose.prod.yml`

**Files:**
- Create: `C:\Users\weka\Learning\whatdesks\docker-compose.prod.yml`

This file runs **all 5 services** on the VPS. The frontend nginx container is the only public-facing service (port 8005). Everything else is on the internal Docker network.

- [ ] **Step 1: Write `docker-compose.prod.yml`**

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: whatdesks-postgres
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - internal
    restart: always
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d ${DB_NAME}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: whatdesks-redis
    command: redis-server --requirepass ${REDIS_PASSWORD} --save 60 1 --loglevel warning
    volumes:
      - redisdata:/data
    networks:
      - internal
    restart: always

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: whatdesks-backend
    env_file: .env.prod
    volumes:
      - uploads:/app/uploads
    networks:
      - internal
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    restart: always

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        VITE_API_URL: ${VITE_API_URL}
        VITE_WS_URL: ${VITE_WS_URL}
    container_name: whatdesks-frontend
    ports:
      - "8005:80"
    volumes:
      - uploads:/app/uploads:ro
    networks:
      - internal
    depends_on:
      - backend
    restart: always

networks:
  internal:
    driver: bridge

volumes:
  pgdata:
  redisdata:
  uploads:
```

- [ ] **Step 2: Create `.env.prod.example`**

Create `C:\Users\weka\Learning\whatdesks\.env.prod.example`:

```env
# Backend environment (used by Go server)
SERVER_PORT=8000
DB_HOST=postgres
DB_PORT=5432
DB_USER=whatdesks
DB_PASSWORD=change-me-strong-password
DB_NAME=whatdesks_db
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=change-me-redis-password
REDIS_DB=0
JWT_SECRET=change-me-very-long-random-secret-at-least-32-chars
UPLOAD_DIR=./uploads

# Docker Compose variables (also read by docker-compose.prod.yml)
VITE_API_URL=http://YOUR_VPS_IP:8005
VITE_WS_URL=ws://YOUR_VPS_IP:8005
```

- [ ] **Step 3: Commit both files**

```bash
cd C:\Users\weka\Learning\whatdesks
git add docker-compose.prod.yml .env.prod.example
git commit -m "feat: add production docker-compose and env template for VPS deployment"
```

---

## Task 7: Deploy on VPS

This task runs on the VPS machine via SSH. Replace `YOUR_VPS_IP` and `YOUR_VPS_USER` with real values.

**Prerequisites on VPS:**
- Docker Engine installed: `curl -fsSL https://get.docker.com | sh`
- Docker Compose plugin: `sudo apt install docker-compose-plugin` (Ubuntu) or equivalent
- Port 8005 open in VPS firewall / security group

- [ ] **Step 1: Push latest code to git remote**

```bash
# on local machine
cd C:\Users\weka\Learning\whatdesks
git push origin main
```

- [ ] **Step 2: SSH into VPS and clone repo**

```bash
ssh YOUR_VPS_USER@YOUR_VPS_IP
git clone https://github.com/YOUR_USER/whatdesks.git /opt/whatdesks
cd /opt/whatdesks
```

- [ ] **Step 3: Create production `.env.prod` on VPS**

```bash
cp .env.prod.example .env.prod
nano .env.prod   # fill in real passwords, JWT secret, VPS IP
```

Minimum edits:
- `DB_PASSWORD` — strong random password
- `REDIS_PASSWORD` — strong random password
- `JWT_SECRET` — at least 32 random characters
- `VITE_API_URL` and `VITE_WS_URL` — replace `YOUR_VPS_IP` with actual IP/domain

- [ ] **Step 4: Build and start all services**

```bash
cd /opt/whatdesks
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Expected output: 5 containers start (`whatdesks-postgres`, `whatdesks-redis`, `whatdesks-backend`, `whatdesks-frontend`)

- [ ] **Step 5: Verify backend is healthy**

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=30
```

Expected: `Server started on port 8000`, no DB connection errors, no panic

- [ ] **Step 6: Access whatdesks UI**

Open browser: `http://YOUR_VPS_IP:8005`

Expected: whatdesks login page loads

- [ ] **Step 7: Register first admin user**

```bash
curl -s -X POST http://YOUR_VPS_IP:8005/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@whatdesks.local","password":"choose-strong-password"}'
```

Expected: `{"message":"User registered successfully",...}`

Note the email and password — these go into mellyna-education `.env` as `WHATDESKS_EMAIL` and `WHATDESKS_PASSWORD`.

- [ ] **Step 8: Pair a WhatsApp device**

1. Login at `http://YOUR_VPS_IP:8005` with the admin account
2. Go to **Devices** → **Add Device** → enter a name
3. Scan the QR code with WhatsApp (linked devices)
4. Wait for status to show **CONNECTED**
5. Note the device **ID** (number) and **UUID** (shown in device details)

These go into mellyna-education `.env`:
- `WHATDESKS_DEVICE_ID=<the number>`
- `WHATDESKS_DEVICE_UUID=<the uuid>`

- [ ] **Step 9: Test send from mellyna-education**

```bash
# In mellyna-education project, set env vars and run a quick test
cd C:\Users\weka\Learning\mellyna-education
WHATDESKS_BASE_URL=http://YOUR_VPS_IP:8005 \
WHATDESKS_EMAIL=admin@whatdesks.local \
WHATDESKS_PASSWORD=your-password \
WHATDESKS_DEVICE_ID=1 \
WHATDESKS_DEVICE_UUID=your-uuid \
npx tsx -e "import('./lib/waha.ts').then(m => m.sendWhatsApp('08xxxxxxxxxx', 'Test dari mellyna-education via whatdesks!'))"
```

Expected: `true` returned, WhatsApp message received on paired phone

---

## Self-Review Checklist

**Spec coverage:**
- [x] sendWhatsApp → Task 1 (text message via whatdesks API)
- [x] sendWhatsAppFile → Task 1 (upload + send with media_url)
- [x] getSessionStatus → Task 1 (device status polling)
- [x] sleep / randomDelay → Task 1 (unchanged, exported as-is)
- [x] All 12 import paths unchanged → Task 1 (file kept at `lib/waha.ts`)
- [x] JWT auth with token caching → Task 1 (60h cache, auto-refresh)
- [x] 401 handling → Task 1 (`_token = null` forces re-login)
- [x] VPS: backend Dockerfile → Task 3
- [x] VPS: frontend Dockerfile → Task 4
- [x] VPS: nginx config → Task 5
- [x] VPS: docker-compose.prod.yml → Task 6
- [x] VPS: pairing + testing → Task 7

**Type consistency:**
- `getToken()` returns `string` (used in all three exported functions)
- `DEVICE_ID` is `number` (matches `device_id: uint64` in Go handler)
- `media_url` field name matches `MediaURL` in Go `SendMessageRequest`
- `file_name` field name matches `FileName` in Go `SendMessageRequest`
- `message_type` returned by upload endpoint (`"image"` or `"document"`) is passed directly to send endpoint

**Waha status string compatibility:**
- mellyna-education checks for `'WORKING'` status (see `app/api/admin/status/route.ts`)
- whatdesks returns `'CONNECTED'` or `'DISCONNECTED'`
- Adapter maps `'CONNECTED'` → `'WORKING'`, else → `'STOPPED'`  ✓

---

## Execution Options

**Plan saved to** `docs/superpowers/plans/2026-06-28-whatdesks-mellyna-integration-vps.md`

**Option 1 — Subagent-Driven (recommended):** Each task dispatched to a fresh subagent with review between tasks. Use `superpowers:subagent-driven-development`.

**Option 2 — Inline Execution:** Execute tasks in this session using `superpowers:executing-plans`.
