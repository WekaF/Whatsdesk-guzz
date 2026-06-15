# WhatsApp Multi-Device Gateway

A high-performance, scalable WhatsApp Multi-Device Gateway built with **Golang (Fiber)** on the backend and **React (Vite, TypeScript, TailwindCSS)** on the frontend. The system manages device pairing via QR codes over WebSockets, queues outgoing messages using Redis Streams, and integrates with whatsmeow library.

---

## Prerequisites

- **Go** (1.25+)
- **Node.js** (v18+) & **npm**
- **Podman** or **Docker** (for database services)

---

## 1. Database & Cache Services Setup

The gateway uses **PostgreSQL** for persistence and **Redis** for stream queuing. 

To avoid conflicts with native PostgreSQL services running on port `5432` on Windows, the Docker/Podman configuration maps PostgreSQL to host port `5433`.

### Option A: Run via Podman (Recommended on Windows)
Since standard `docker-compose` on Windows might require pipe elevation, you can run the containers directly in user-space via Podman:

```bash
# Start Podman WSL VM (if stopped)
podman machine start

# Run PostgreSQL on port 5433
podman run -d --name whatapps-postgres -p 5433:5432 -e POSTGRES_USER=whatapps -e POSTGRES_PASSWORD=whatappspassword -e POSTGRES_DB=whatapps_db postgres:15-alpine

# Run Redis on port 6379
podman run -d --name whatapps-redis -p 6379:6379 redis:7-alpine
```

### Option B: Run via Docker Compose
If you have Docker Desktop running:
```bash
docker-compose up -d
```

---

## 2. Backend Setup

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```

2. Confirm `.env` configuration (created at `backend/.env`):
   ```env
   SERVER_PORT=8000
   DB_HOST=localhost
   DB_PORT=5433
   DB_USER=whatapps
   DB_PASSWORD=whatappspassword
   DB_NAME=whatapps_db
   REDIS_HOST=localhost
   REDIS_PORT=6379
   JWT_SECRET=super-secret-key-whatsapp-gateway
   ```

3. Download dependencies and tidy module:
   ```bash
   go mod tidy
   ```

4. Build and run the server:
   ```bash
   # Build the executable
   go build -o server.exe ./cmd/server
   
   # Run the server
   ./server.exe
   ```
   The backend server will run and listen on `http://localhost:8000`.

### Database Migrations

The Go backend handles migrations in three ways:

1. **Automatic Migrations (GORM)**: 
   The server automatically runs migrations on startup. It checks for database existence (creating the `whatapps` database if missing), enables the `"uuid-ossp"` extension, auto-migrates all tables to match GORM schemas (specifying `uuid_generate_v4()` defaults), and seeds default admin credentials.

2. **Golang Migration Command**:
   If you want to run the database creation, table migrations, and seeding explicitly without starting the web server, run:
   ```bash
   cd backend
   go run cmd/migrate/main.go
   ```

3. **Manual SQL Migrations (Optional)**:
   For explicit raw SQL schema deployments, the migration script is stored at [000001_init_schema.up.sql](file:///d:/apps/products/whatapps/backend/migrations/000001_init_schema.up.sql). You can apply the schema manually using the `golang-migrate` command line tool:
   ```bash
   # Install golang-migrate CLI
   go install github.com/golang-migrate/migrate/v4/cmd/migrate@latest

   # Apply the SQL migration script (update credentials based on your .env settings)
   migrate -path backend/migrations -database "postgres://postgres:abdulkhafit@localhost:5432/whatapps?sslmode=disable" up
   ```

---

## 3. Frontend Setup

1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```

2. Confirm `.env` configuration (created at `frontend/.env`):
   ```env
   VITE_API_URL=http://localhost:8000
   VITE_WS_URL=ws://localhost:8000
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173/` in your browser to access the admin dashboard.

---

## 4. API Integration Quickstart

You can manually trigger message dispatch by making a POST request from external apps or scripts:

### Authentication
Include the JWT token returned during login/registration in the headers:
```http
Authorization: Bearer <your-jwt-token>
Content-Type: application/json
```

### Send Message Endpoint
- **URL**: `POST http://localhost:8000/api/messages/send`
- **Payload**:
```json
{
  "device_id": 1,
  "phone": "628123456789",
  "message": "Hello from POS Billing System!"
}
```
*Note: Make sure to include the country code without the leading `+` sign for the phone number.*

---

## 5. Production Deployment Guide (Ubuntu Systemd)

Follow these steps to deploy the Go backend as a production service on Ubuntu using systemd.

### Step 1: Build the Backend Binary
Cross-compile the Go application for Linux AMD64 from your local machine:
```bash
cd backend
$env:GOOS="linux"; $env:GOARCH="amd64"; go build -ldflags="-w -s" -o whatapps-backend ./cmd/server
```
*(Or if you are compiling directly on the Ubuntu server, simply run: `go build -ldflags="-w -s" -o whatapps-backend ./cmd/server`)*

### Step 2: Prepare the Server Directory
1. Transfer the compiled `whatapps-backend` binary and your production `.env` file to your server (e.g., to `/opt/whatapps/`).
2. Make sure the binary has execute permissions and configure the folder ownership:
   ```bash
   sudo mkdir -p /opt/whatapps
   sudo mv whatapps-backend /opt/whatapps/
   sudo cp .env.production /opt/whatapps/.env
   sudo chmod +x /opt/whatapps/whatapps-backend
   sudo chown -R www-data:www-data /opt/whatapps
   ```

### Step 3: Create Systemd Service File
Create a new service configuration file:
```bash
sudo nano /etc/systemd/system/whatapps-backend.service
```

Paste the following configurations:
```ini
[Unit]
Description=WhatsApp Gateway Backend Service
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/whatapps
ExecStart=/opt/whatapps/whatapps-backend
Restart=always
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=whatapps-backend
Environment=PORT=8000

[Install]
WantedBy=multi-user.target
```

### Step 4: Manage the Service
Reload systemd daemon, enable the service to start automatically on system boot, and start it:
```bash
# Reload systemd manager configuration
sudo systemctl daemon-reload

# Enable service to run on boot
sudo systemctl enable whatapps-backend

# Start the service
sudo systemctl start whatapps-backend

# Check current runtime status
sudo systemctl status whatapps-backend
```

### Step 5: Monitoring Logs
To view live logs from the backend service, use `journalctl`:
```bash
sudo journalctl -u whatapps-backend -f
```

---

## 6. Running Production Build on Windows

Follow these steps to build and run the Go backend on a Windows machine.

### Step 1: Build the Backend Executable
Compile the Go application for Windows AMD64. Open PowerShell and run:
```powershell
cd backend
# Set build environment and compile
$env:GOOS="windows"
$env:GOARCH="amd64"
go build -ldflags="-w -s" -o whatapps-backend.exe ./cmd/server
```
*(If you are using standard Command Prompt (cmd), run: `set GOOS=windows && set GOARCH=amd64 && go build -ldflags="-w -s" -o whatapps-backend.exe ./cmd/server`)*

### Step 2: Set Up Environment File
Ensure your `.env` file containing database, port, and Redis details is in the same directory as the newly created `whatapps-backend.exe` binary:
```
whatapps-backend.exe
.env
```

### Step 3: Run the Service
You can run the service directly from PowerShell/Command Prompt:
```powershell
.\whatapps-backend.exe
```

### Optional: Running as a Windows Service (Using NSSM)
To run the executable in the background as a Windows Service (similar to systemd in Linux), you can use **NSSM (Non-Sucking Service Manager)**:
1. Download NSSM from [nssm.cc](https://nssm.cc/) and add it to your System PATH.
2. Install the service via PowerShell (run as Administrator):
   ```powershell
   nssm install WhatappsBackend "C:\path\to\your\folder\whatapps-backend.exe"
   ```
3. Set the startup directory (AppDirectory) to the folder containing your `.env` file:
   ```powershell
   nssm set WhatappsBackend AppDirectory "C:\path\to\your\folder"
   ```
4. Start the service:
   ```powershell
   nssm start WhatappsBackend
   ```
5. To stop or edit:
   ```powershell
   nssm stop WhatappsBackend
   nssm edit WhatappsBackend
   ```


