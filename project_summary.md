# Ringkasan Proyek: WhatsApp Gateway

Sistem ini adalah **WhatsApp Multi-Device Gateway** berskala tinggi (high-performance & scalable). Sistem ini berfungsi sebagai jembatan (API Gateway) yang memungkinkan aplikasi eksternal untuk mengirim dan menerima pesan WhatsApp secara terprogram. Selain itu, sistem ini dirancang untuk memiliki kapabilitas manajemen tugas (Task Management) dan CRM dasar.

## Teknologi Utama yang Digunakan

*   **Backend:** Golang dengan framework **Fiber** untuk performa API yang cepat. Menggunakan library **`whatsmeow`** untuk koneksi ke WhatsApp server.
*   **Frontend:** React (Vite, TypeScript) dengan **TailwindCSS** & **Shadcn UI** untuk dashboard admin.
*   **Database:** **PostgreSQL** (via GORM) untuk penyimpanan data yang persisten (user, device, pesan, task, dll).
*   **Queue & Cache:** **Redis** (Streams / Pub-Sub) digunakan sebagai *message broker* untuk menangani antrean pengiriman pesan secara asinkron agar sistem tidak mudah down saat beban tinggi.
*   **Realtime:** Menggunakan **WebSocket** untuk komunikasi *real-time* antara Go backend dan React frontend.

## Fitur Utama & Rencana Pengembangan

### 1. Multi-Device & Multi-User
Sistem mendukung banyak pengguna (admin/PIC) di mana masing-masing dapat menghubungkan dan mengelola banyak nomor/perangkat WhatsApp sekaligus dalam satu sistem secara terpusat. Hal ini memungkinkan satu instansi menggunakan banyak nomor WhatsApp (layanan pelanggan, marketing, dll) yang dikendalikan oleh beberapa orang secara bersamaan.

### 2. Import Contact
Fitur untuk memasukkan daftar kontak (nomor WhatsApp beserta data pelengkap) secara massal ke dalam sistem (misalnya via upload file CSV atau Excel). Data kontak ini nantinya dapat digunakan untuk keperluan *broadcast*, pemetaan kategori, dan pelacakan riwayat klien.

### 3. Pairing via QR Code (Real-time)
Koneksi perangkat WhatsApp dilakukan dengan melakukan scan QR Code yang di-generate dan ditampilkan secara *real-time* di dashboard menggunakan WebSocket tanpa perlu *refresh* halaman.

### 4. Kirim & Terima Pesan (Messaging)
*   Mengirim pesan teks ke nomor tujuan secara otomatis melalui REST API (`POST /messages/send`).
*   Menerima pesan masuk dan mencatatnya ke dalam database sebagai riwayat interaksi awal.

### 5. Auto Reply dengan Assign Task (Otomasi Tugas)
Selain membalas pesan secara otomatis berdasarkan kata kunci (*keyword*), sistem juga akan memprosesnya menjadi sebuah *Task* (Tugas/Tiket) dan otomatis menetapkan (*assign*) tugas tersebut kepada tim/PIC terkait. Misalnya, pesan pelanggan dengan format "KOMPLAIN" akan otomatis membuat *task* dan di-assign ke departemen *Support*.

### 6. Categori Task
Setiap pesan yang menjadi tugas (Task) dapat dikelompokkan ke dalam kategori tertentu (contoh: *Sales*, *Support*, *General Query*, *Maintenance*). Pengelompokan ini mempermudah pencarian, *filtering*, dan penentuan alur kerja (workflow) selanjutnya.

### 7. Task Message Record (Perekaman Pesan pada Task)
Sistem merekam dan menyatukan seluruh riwayat percakapan (baik pesan masuk dari pelanggan maupun balasan dari PIC) yang terkait dengan *Task* tertentu. Perekaman percakapan ini akan terus dilacak dalam satu ruangan konteks (thread) hingga *Task* tersebut dinyatakan selesai (Closed), sehingga riwayat permasalahan tidak terputus.

### 8. Aging dan Log Activity Task
*   **Aging Task:** Fitur untuk mengukur durasi waktu (*aging*) dari sejak sebuah *Task* dibuat hingga diselesaikan. Hal ini sangat krusial untuk mengukur metrik SLA (Service Level Agreement) dari kinerja tim.
*   **Log Activity:** Fitur audit trail yang mencatat setiap kejadian atau perubahan status pada suatu *Task* (misalnya: kapan *Task* dibuat, kapan status berubah dari *Pending* ke *In Progress*, atau kapan dialihkan dari PIC A ke PIC B).

### 9. Configurable Notif ke PIC
Sistem menyediakan peringatan atau notifikasi (melalui pesan WhatsApp bot internal, atau Web Push/Email) kepada PIC (Person In Charge) terkait. Notifikasi ini dapat dikonfigurasi, misal saat ada *Task* baru yang di-assign kepada mereka, mendekati batas waktu SLA, atau jika *Task* belum direspons dalam kurun waktu tertentu.

### 10. Broadcast Message & Segmentasi by Categori Task
Sistem dapat mengirimkan pesan massal (broadcast) ke banyak nomor sekaligus, diproses secara aman menggunakan *antrean background* (Redis) untuk mencegah pemblokiran. Hal yang membedakan adalah kemampuan untuk mem-filter target broadcast berdasarkan **Kategori Task**. Misalnya: mengirim pesan promo perpanjangan langganan hanya kepada *user* yang pernah memiliki *Task* berkategori "Sales/Subscription".

### 11. Dashboard & Summary
Halaman utama dasbor yang memberikan ringkasan status operasional secara langsung (real-time). Visualisasi rangkuman ini mencakup:
*   Total *Task* yang aktif (Open, In Progress) vs Selesai (Closed).
*   Distribusi *Task* berdasarkan Kategori dan PIC.
*   Rata-rata waktu penyelesaian *Task* (*Aging/SLA Performance*).
*   Status koneksi Multi-Device.

### 12. Webhook Dispatcher
Sistem mampu mengirimkan event atau pesan masuk langsung ke aplikasi/URL pihak ketiga milik Anda untuk memicu proses eksternal.

### 13. Asynchronous Message Queueing
Memastikan kehandalan dengan menggunakan **Redis Stream**. Semua operasi berat dimasukkan ke antrean (*queue*) latar belakang sehingga aplikasi tidak *freeze* atau lambat meskipun menerima lonjakan trafik pesan mendadak.
