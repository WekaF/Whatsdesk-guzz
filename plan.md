# Rencana Arsitektur WhatsApp Gateway

Sistem WhatsApp Gateway berskala tinggi menggunakan Golang (Backend) dan React (Frontend) dengan fitur Multi-Device, Multi-User, Broadcast, Auto Reply, Webhook, dan Queueing.

## Arsitektur High Level

```
+-------------------+
|    React Admin    |
+---------+---------+
          |
          v
+-------------------+
|   API Gateway     |
|      Golang       |
+---------+---------+
          |
    +-----+-----+
    |           |
    v           v
+--------+   +---------+
|  Auth  |   | WhatsApp|
|Service |   | Service |
+--------+   +---------+
                 |
                 v
          +-------------+
          | WhatsApp MD |
          |  Client     |
          | (whatsmeow) |
          +------+------+
                 |
                 v
          +-------------+
          |  WhatsApp   |
          |   Server    |
          +-------------+

                 ^
                 |
          Incoming Msg
                 |
                 v

          +-------------+
          | Queue/Rabbit|
          | or Redis    |
          +------+------+
                 |
      +----------+----------+
      |                     |
      v                     v
+------------+      +--------------+
| Auto Reply |      | Webhook      |
| Worker     |      | Dispatcher   |
+------------+      +--------------+

                 |
                 v

          +-------------+
          | PostgreSQL  |
          +-------------+
```

---

## Teknologi yang Direkomendasikan

### Backend (Golang 1.25+)
* **Framework:** Fiber (lebih disukai untuk gateway berkinerja tinggi)
* **Database & ORM:** GORM dengan PostgreSQL
* **Message Queue & Cache:** Redis (Streams / Pub-Sub)
* **WhatsApp Library:** `whatsmeow`
* **Keamanan:** JWT (JSON Web Tokens)
* **Real-time:** `github.com/gofiber/websocket`

### Frontend (React + Vite + TypeScript)
* **Styling:** TailwindCSS & Shadcn UI
* **State Management:** Zustand
* **Data Fetching:** TanStack Query (React Query)

---

## Database Design

### 1. `users`
* `id`: BIGINT (Auto-Increment, Primary Key)
* `uuid`: UUID (Unique)
* `name`: VARCHAR
* `email`: VARCHAR (Unique)
* `password`: VARCHAR (Hashed)
* `role`: VARCHAR
* `created_at`: TIMESTAMP

### 2. `devices`
* `id`: BIGINT (Auto-Increment, Primary Key)
* `uuid`: UUID (Unique)
* `user_id`: BIGINT (Foreign Key to `users.id`)
* `device_name`: VARCHAR
* `phone`: VARCHAR
* `status`: VARCHAR (CONNECTED, DISCONNECTED, SCANNING)
* `jid`: VARCHAR
* `created_at`: TIMESTAMP

### 3. `messages`
* `id`: BIGINT (Auto-Increment, Primary Key)
* `uuid`: UUID (Unique)
* `device_id`: BIGINT (Foreign Key to `devices.id`)
* `direction`: VARCHAR (IN, OUT)
* `phone`: VARCHAR
* `message`: TEXT
* `status`: VARCHAR (PENDING, SENT, DELIVERED, READ, FAILED)
* `sent_at`: TIMESTAMP (Nullable)
* `created_at`: TIMESTAMP

### 4. `broadcasts`
* `id`: BIGINT (Auto-Increment, Primary Key)
* `uuid`: UUID (Unique)
* `user_id`: BIGINT (Foreign Key to `users.id`)
* `title`: VARCHAR
* `message`: TEXT
* `status`: VARCHAR (PENDING, PROCESSING, COMPLETED, FAILED)
* `created_at`: TIMESTAMP

### 5. `broadcast_details`
* `id`: BIGINT (Auto-Increment, Primary Key)
* `uuid`: UUID (Unique)
* `broadcast_id`: BIGINT (Foreign Key to `broadcasts.id`)
* `phone`: VARCHAR
* `status`: VARCHAR (PENDING, SENT, FAILED)
* `sent_at`: TIMESTAMP (Nullable)

### 6. `auto_replies`
* `id`: BIGINT (Auto-Increment, Primary Key)
* `uuid`: UUID (Unique)
* `device_id`: BIGINT (Foreign Key to `devices.id`)
* `keyword`: VARCHAR (Keyword trigger)
* `match_type`: VARCHAR (EXACT, CONTAINS, START_WITH)
* `reply_message`: TEXT (Message template to reply with)
* `is_active`: BOOLEAN (Status active/inactive)
* `created_at`: TIMESTAMP

---

## Alur Sistem (Flows)

### 1. Flow Scan QR
1. **React** mengirim request `GET /devices/:id/qr` ke Go.
2. **Go** meminta whatsmeow generate QR code.
3. **React** menampilkan QR code ke user.
4. **User** memindai QR code via aplikasi WhatsApp.
5. **WhatsApp Server** mengonfirmasi koneksi, status berubah di **whatsmeow**.
6. **Go** mendeteksi status tersambung, memperbarui database, dan mengirim event update status ke React via **WebSocket**.

### 2. Flow Kirim Pesan
1. **React** mengirim request `POST /messages/send` ke API Gateway.
2. **API Gateway** validasi dan memasukkan data pesan ke **Redis Queue**.
3. **Worker Service** mengambil pesan dari queue secara asinkron.
4. **WhatsApp Service** (whatsmeow) mengirim pesan ke WhatsApp Server.
5. Setelah mendapat ACK, database diperbarui (status: `SENT`/`DELIVERED`).

### 3. Flow Incoming Message
1. **WhatsApp Server** mengirim callback pesan ke event handler **whatsmeow**.
2. Event handler memasukkan pesan masuk ke **Redis Queue**.
3. **Auto Reply Worker**, **Webhook Worker**, **CRM Worker**, dll., memproses antrean tersebut secara paralel.
4. Go mengirim notifikasi realtime ke frontend via WebSocket dengan event type `"message_received"`.

### 4. Flow Auto Reply Bot (Opsi Keyword-Based)
1. Pesan masuk diterima oleh handler whatsmeow di Go.
2. Sistem mencocokkan teks pesan masuk dengan daftar aturan aktif (`is_active = true`) pada database `auto_replies` untuk `device_id` bersangkutan:
   - **EXACT**: Pesan masuk persis sama dengan keyword.
   - **CONTAINS**: Pesan masuk mengandung keyword.
   - **START_WITH**: Pesan masuk diawali oleh keyword.
3. Jika ditemukan aturan yang cocok, sistem akan:
   - Membuat rekaman pesan baru di database dengan tipe `OUT`, status `PENDING`, dan isi pesan sesuai `reply_message`.
   - Mengantrekan ID pesan keluar tersebut ke **Redis Stream** (`whatsapp_messages_stream`).
4. **Queue Worker** mengambil pesan keluar dari stream dan memanggil WhatsApp client untuk mengirimkan balasan otomatis ke pengirim asal.

---

## Struktur Folder Project

### Backend (`backend/`)
```
backend/
├── cmd/
│   └── server/          # Entry point aplikasi
├── internal/
│   ├── auth/            # Modul login & registrasi
│   ├── device/          # Pengelolaan device WA
│   ├── message/         # Pengiriman/penerimaan pesan tunggal
│   ├── broadcast/       # Pengelolaan broadcast massal
│   ├── webhook/         # Konfigurasi & dispatcher webhook
│   ├── worker/          # Queue worker
│   ├── whatsapp/        # whatsmeow client manager
│   └── autoreply/       # CRUD & Logic Auto Reply Bot [NEW]
├── pkg/
│   ├── redis/           # Redis client & helper
│   ├── database/        # GORM & PostgreSQL init
│   └── logger/          # logging wrapper
├── migrations/          # File migrasi database
└── configs/             # Environment configs
```

### Frontend (`frontend/`)
```
frontend/
└── src/
    ├── pages/           # Halaman Dashboard, Devices, Broadcasts, Logs, Auto Replies [MODIFIED]
    ├── components/      # UI components (QR Code viewer, dll.)
    ├── layouts/         # Layout dashboard & login
    ├── hooks/           # Custom React hooks
    ├── services/        # API client requests
    ├── store/           # Zustand state management
    └── routes/          # React Router configuration
```
