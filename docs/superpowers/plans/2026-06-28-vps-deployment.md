# whatdesks VPS Deployment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy whatdesks (Go backend + React frontend + PostgreSQL + Redis) to a Linux VPS with domain `whatsdesk.abdulkhafit.biz.id` and HTTPS.

**Architecture:** Docker Compose runs all 4 app services (postgres, redis, backend, frontend-nginx) on the VPS. A host-level Nginx with Certbot handles SSL termination on port 443 and proxies to the Docker frontend container on port 8005. The VPS firewall only exposes ports 22, 80, and 443 to the public.

**Tech Stack:** Docker, Docker Compose, Go 1.24+ (alpine), Node 20 (alpine), Nginx, Certbot (Let's Encrypt), PostgreSQL 15, Redis 7

---

## Pre-flight Checklist (do before starting)

- [ ] VPS is running Ubuntu 22.04 LTS (or 20.04)
- [ ] You have SSH access: `ssh user@YOUR_VPS_IP`
- [ ] DNS A record for `whatsdesk.abdulkhafit.biz.id` → VPS IP is propagated  
      Verify: `nslookup whatsdesk.abdulkhafit.biz.id` returns your VPS IP
- [ ] Port 80 and 443 are open in VPS firewall / cloud provider security group

---

## File Structure

New files to create in `C:\Users\weka\Learning\whatdesks\`:

| File | Purpose |
|------|---------|
| `backend/Dockerfile` | Go multi-stage build |
| `frontend/Dockerfile` | Node build + nginx serve |
| `frontend/nginx.docker.conf` | nginx config inside frontend container |
| `docker-compose.prod.yml` | All 4 Docker services |
| `.env.prod.example` | Production env template |

---

## Task 1: Create `backend/Dockerfile`

**Files:**
- Create: `backend/Dockerfile`

- [ ] **Step 1: Write the Dockerfile**

Create `C:\Users\weka\Learning\whatdesks\backend\Dockerfile`:

```dockerfile
# Stage 1: build the Go binary
FROM golang:alpine AS builder
RUN apk add --no-cache gcc musl-dev
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /server ./cmd/server

# Stage 2: minimal runtime image
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /server ./server
COPY migrations ./migrations
RUN mkdir -p uploads
EXPOSE 8080
CMD ["./server"]
```

- [ ] **Step 2: Verify build locally**

```powershell
cd C:\Users\weka\Learning\whatdesks\backend
docker build -t whatdesks-backend-test .
```

Expected: `Successfully built ...` and `whatdesks-backend-test` appears in `docker images`.

- [ ] **Step 3: Commit**

```bash
git add backend/Dockerfile
git commit -m "feat: add Go multi-stage Dockerfile for backend"
```

---

## Task 2: Create `frontend/nginx.docker.conf`

**Files:**
- Create: `frontend/nginx.docker.conf`

This nginx config runs **inside the frontend Docker container**. It serves the React SPA and proxies `/api/`, `/auth/`, `/uploads/`, `/devices/` to the Go backend container (named `backend` in docker-compose).

- [ ] **Step 1: Write nginx.docker.conf**

Create `C:\Users\weka\Learning\whatdesks\frontend\nginx.docker.conf`:

```nginx
upstream backend_server {
    server backend:8080;
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

    # WebSocket (QR pairing)
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

    # Media uploads served from Docker volume
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
git add frontend/nginx.docker.conf
git commit -m "feat: add nginx config for frontend Docker container"
```

---

## Task 3: Create `frontend/Dockerfile`

**Files:**
- Create: `frontend/Dockerfile`

The `VITE_API_URL` and `VITE_WS_URL` are baked into the React build at image build time via `ARG`. Pass the production domain when running `docker compose build`.

- [ ] **Step 1: Write the Dockerfile**

Create `C:\Users\weka\Learning\whatdesks\frontend\Dockerfile`:

```dockerfile
# Stage 1: build React app
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
ARG VITE_API_URL=https://whatsdesk.abdulkhafit.biz.id
ARG VITE_WS_URL=wss://whatsdesk.abdulkhafit.biz.id
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
git add frontend/Dockerfile
git commit -m "feat: add Node multi-stage Dockerfile for frontend"
```

---

## Task 4: Create `docker-compose.prod.yml` and `.env.prod.example`

**Files:**
- Create: `docker-compose.prod.yml`
- Create: `.env.prod.example`

- [ ] **Step 1: Write `docker-compose.prod.yml`**

Create `C:\Users\weka\Learning\whatdesks\docker-compose.prod.yml`:

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
        VITE_API_URL: https://whatsdesk.abdulkhafit.biz.id
        VITE_WS_URL: wss://whatsdesk.abdulkhafit.biz.id
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

- [ ] **Step 2: Write `.env.prod.example`**

Create `C:\Users\weka\Learning\whatdesks\.env.prod.example`:

```env
# Go backend settings
SERVER_PORT=8080
DB_HOST=postgres
DB_PORT=5432
DB_USER=whatdesks
DB_PASSWORD=CHANGE_ME_STRONG_DB_PASSWORD
DB_NAME=whatdesks_db
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=CHANGE_ME_STRONG_REDIS_PASSWORD
REDIS_DB=0
JWT_SECRET=CHANGE_ME_AT_LEAST_32_RANDOM_CHARS
UPLOAD_DIR=./uploads
```

- [ ] **Step 3: Commit both files**

```bash
git add docker-compose.prod.yml .env.prod.example
git commit -m "feat: add production docker-compose and env template"
```

---

## Task 5: Push to Git Remote

- [ ] **Step 1: Push all commits**

```bash
cd C:\Users\weka\Learning\whatdesks
git push origin main
```

Expected: All 4 commits pushed, no errors.

---

## Task 6: Provision VPS

Run all commands via SSH on the VPS: `ssh user@YOUR_VPS_IP`

- [ ] **Step 1: Install Docker**

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

Verify: `docker --version` → `Docker version 24+`

- [ ] **Step 2: Install Docker Compose plugin**

```bash
sudo apt-get update
sudo apt-get install -y docker-compose-plugin
```

Verify: `docker compose version` → `Docker Compose version v2+`

- [ ] **Step 3: Install Nginx and Certbot on host**

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

- [ ] **Step 4: Clone the repo onto VPS**

```bash
git clone https://github.com/YOUR_GITHUB_USER/whatdesks.git /opt/whatdesks
cd /opt/whatdesks
```

If repo is private, use a deploy key or personal access token:
```bash
git clone https://YOUR_GITHUB_TOKEN@github.com/YOUR_GITHUB_USER/whatdesks.git /opt/whatdesks
```

- [ ] **Step 5: Create production `.env.prod` on VPS**

```bash
cd /opt/whatdesks
cp .env.prod.example .env.prod
nano .env.prod
```

Fill in real values:
- `DB_PASSWORD` → generate: `openssl rand -base64 24`
- `REDIS_PASSWORD` → generate: `openssl rand -base64 24`
- `JWT_SECRET` → generate: `openssl rand -base64 48`

Final `.env.prod` should look like:
```env
SERVER_PORT=8080
DB_HOST=postgres
DB_PORT=5432
DB_USER=whatdesks
DB_PASSWORD=aBcD1234XyZqWert98765
DB_NAME=whatdesks_db
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=rEdIs9876SecurePass
REDIS_DB=0
JWT_SECRET=very-long-random-secret-at-least-32-characters-here
UPLOAD_DIR=./uploads
```

---

## Task 7: Deploy Docker Containers

Run on VPS inside `/opt/whatdesks/`.

- [ ] **Step 1: Build and start all services**

```bash
cd /opt/whatdesks
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

This builds both Go backend and React frontend, then starts all 4 containers. First build takes 3–5 minutes.

Expected output (last lines):
```
✔ Container whatdesks-postgres   Started
✔ Container whatdesks-redis      Started
✔ Container whatdesks-backend    Started
✔ Container whatdesks-frontend   Started
```

- [ ] **Step 2: Verify all containers running**

```bash
docker compose -f docker-compose.prod.yml ps
```

Expected: All 4 containers show `running` status.

- [ ] **Step 3: Verify backend logs (no errors)**

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=30
```

Expected: 
```
Server started on port 8080
Database connected
Redis connected
```

No `panic`, no `connection refused`.

- [ ] **Step 4: Test internal connectivity**

```bash
curl -s http://127.0.0.1:8005/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"wrong"}' | head -c 100
```

Expected: `{"error":"Invalid email or password"}` (not connection refused — proves nginx → backend routing works)

---

## Task 8: Configure Host Nginx + SSL

Run on VPS.

- [ ] **Step 1: Write host nginx config**

```bash
sudo nano /etc/nginx/sites-available/whatdesks
```

Paste:
```nginx
server {
    listen 80;
    server_name whatsdesk.abdulkhafit.biz.id;

    location / {
        proxy_pass http://127.0.0.1:8005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
        proxy_read_timeout 86400s;
    }
}
```

- [ ] **Step 2: Enable the site**

```bash
sudo ln -s /etc/nginx/sites-available/whatdesks /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful`

- [ ] **Step 3: Obtain SSL certificate**

```bash
sudo certbot --nginx -d whatsdesk.abdulkhafit.biz.id
```

Follow prompts:
- Enter your email for Let's Encrypt alerts
- Agree to terms: `Y`
- Redirect HTTP → HTTPS: choose `2` (recommended)

Expected: `Successfully deployed certificate for whatsdesk.abdulkhafit.biz.id`

Certbot auto-modifies your nginx config to add HTTPS.

- [ ] **Step 4: Verify SSL works**

Open browser: `https://whatsdesk.abdulkhafit.biz.id`

Expected: whatdesks login page loads with green padlock (HTTPS).

- [ ] **Step 5: Test login via HTTPS**

```bash
curl -s https://whatsdesk.abdulkhafit.biz.id/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@whatapps.com","password":"adminpassword"}'
```

Expected: JSON with `"token":"eyJ..."` (note: this is the local account — need to re-register on VPS)

---

## Task 9: Register Admin and Pair WhatsApp Device on VPS

- [ ] **Step 1: Register admin account on VPS**

```bash
curl -s -X POST https://whatsdesk.abdulkhafit.biz.id/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@whatapps.com","password":"adminpassword"}'
```

Expected: `{"message":"User registered successfully",...}`

- [ ] **Step 2: Login and get token**

```bash
curl -s -X POST https://whatsdesk.abdulkhafit.biz.id/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@whatapps.com","password":"adminpassword"}' | python3 -m json.tool
```

Expected: JSON with `token` field.

- [ ] **Step 3: Open whatdesks UI on VPS and pair device**

Open browser: `https://whatsdesk.abdulkhafit.biz.id`

1. Login dengan admin account
2. Devices → Add Device → masukkan nama device
3. Scan QR code dengan WhatsApp (Settings → Linked Devices)
4. Tunggu status **CONNECTED**
5. Catat device **ID** dan **UUID** dari UI

- [ ] **Step 4: Get device ID and UUID via API**

```bash
TOKEN=$(curl -s -X POST https://whatsdesk.abdulkhafit.biz.id/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@whatapps.com","password":"adminpassword"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -s https://whatsdesk.abdulkhafit.biz.id/api/devices \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: Array with device objects showing `id`, `uuid`, `status: "CONNECTED"`, `phone`.

---

## Task 10: Update mellyna-education to Point to VPS

- [ ] **Step 1: Update `.env.local` in mellyna-education**

```env
WHATDESKS_BASE_URL=https://whatsdesk.abdulkhafit.biz.id
WHATDESKS_EMAIL=admin@whatapps.com
WHATDESKS_PASSWORD=adminpassword
WHATDESKS_DEVICE_ID=<device ID from Task 9 Step 4>
WHATDESKS_DEVICE_UUID=<device UUID from Task 9 Step 4>
```

- [ ] **Step 2: Test send from mellyna-education → VPS**

```powershell
$env:WHATDESKS_BASE_URL="https://whatsdesk.abdulkhafit.biz.id"
$env:WHATDESKS_EMAIL="admin@whatapps.com"
$env:WHATDESKS_PASSWORD="adminpassword"
$env:WHATDESKS_DEVICE_ID="<id>"
$env:WHATDESKS_DEVICE_UUID="<uuid>"

npx tsx "C:\Users\weka\AppData\Local\Temp\claude\c--Users-weka-Learning-whatdesks\08dd47c2-5338-4478-9197-d894d379bdc2\scratchpad\test-waha.ts"
```

Expected:
```
session status: WORKING
sendWhatsApp result: true
```

WhatsApp message arrives on phone.

---

## Task 11: Auto-restart on VPS reboot

- [ ] **Step 1: Create systemd service**

```bash
sudo nano /etc/systemd/system/whatdesks.service
```

Paste:
```ini
[Unit]
Description=whatdesks Docker Compose
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/whatdesks
ExecStart=docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
ExecStop=docker compose -f docker-compose.prod.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Enable and start service**

```bash
sudo systemctl daemon-reload
sudo systemctl enable whatdesks
sudo systemctl start whatdesks
```

Expected: `systemctl status whatdesks` shows `active (exited)` — this is correct for oneshot services.

- [ ] **Step 3: Test reboot survival**

```bash
sudo reboot
```

After VPS comes back up (~1 minute), check:
```bash
ssh user@YOUR_VPS_IP
docker ps
```

Expected: All 4 whatdesks containers running automatically.

---

## Self-Review

**Spec coverage:**
- [x] Backend Dockerfile → Task 1
- [x] Frontend Dockerfile → Task 3
- [x] nginx config (in-container) → Task 2
- [x] docker-compose.prod.yml → Task 4
- [x] VPS provisioning (Docker, nginx, certbot) → Task 6
- [x] Deploy containers → Task 7
- [x] SSL with Let's Encrypt → Task 8
- [x] Register admin + pair device on VPS → Task 9
- [x] Update mellyna-education to use VPS → Task 10
- [x] Auto-restart on reboot → Task 11

**Notes:**
- WhatsApp session stored in PostgreSQL volume (`pgdata`) — persists across container restarts
- Uploads stored in named volume (`uploads`) — shared between backend (write) and frontend-nginx (read)
- SSL auto-renews via certbot systemd timer (installed automatically)

---

## Troubleshooting Reference

| Problem | Command | What to check |
|---------|---------|--------------|
| Backend won't start | `docker compose -f docker-compose.prod.yml logs backend` | DB connection string, migration errors |
| Can't reach site | `curl -v http://127.0.0.1:8005` | Is frontend container up? |
| SSL fails | `sudo certbot certificates` | DNS propagated? Port 80 open? |
| WhatsApp disconnects | Login UI → Devices → reconnect | Normal; scan QR again |
| Update code | `git pull && docker compose -f docker-compose.prod.yml up -d --build` | Rebuilds only changed images |
