# 📱 Panduan Build APK Native di Android Studio & Kunci Kelancaran Komunikasi Rider

Seluruh konfigurasi native Android (Capacitor), izin hardware Android (`AndroidManifest.xml`), izin WebView WebRTC (`MainActivity.java`), dan sinkronisasi server signaling (`Socket.io`) telah dirapikan secara menyeluruh agar semua rider bisa saling terhubung lancar tanpa hambatan browser.

---

## 🛠️ Langkah Menjadikan APK Native di Android Studio

### Langkah 1: Unduh Proyek dari AI Studio
1. Di pojok kanan atas Google AI Studio, klik ikon **Settings** (⚙️) atau titik tiga.
2. Pilih **Download as ZIP** (atau **Export to GitHub** jika terbiasa memakai Git).
3. Ekstrak file ZIP tersebut di laptop / PC Anda (misal ke `C:\Projects\gibah-berjamaah` atau `/home/user/gibah-berjamaah`).

### Langkah 2: Buka Folder Proyek di Android Studio
1. Buka aplikasi **Android Studio** di laptop/PC Anda.
2. Pada layar selamat datang, klik **Open** (atau menu **File > Open**).
3. **PENTING:** Arahkan dan pilih folder **`android`** yang berada di dalam folder hasil ekstrak:
   ```text
   gibah-berjamaah/
   └── android/   <--- PILIH FOLDER INI
   ```
4. Klik **OK / Open**.
5. Tunggu Android Studio menyelesaikan proses **Gradle Sync & Indexing** (perhatikan bilah progres di pojok kanan bawah sampai selesai bertanda centang hijau).

### Langkah 3: Build APK Debug (Siap Pakai untuk Semua Rider)
1. Di menu bilah atas Android Studio, klik:
   👉 **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**
2. Android Studio akan mengompilasi kode menjadi file `.apk`.
3. Setelah proses selesai (biasanya 1–2 menit), akan muncul notifikasi pop-up di pojok kanan bawah:
   > *"APK(s) generated successfully for module 'app'"*
4. Klik tautan bertuliskan **locate** pada notifikasi tersebut, atau buka foldernya secara manual di:
   ```text
   android/app/build/outputs/apk/debug/app-debug.apk
   ```
5. Ubah nama file tersebut agar mudah dibagikan, misalnya: `GibahBerjamaah-v1.0.apk`.
6. Kirim file `.apk` tersebut ke semua anggota rombongan touring melalui WhatsApp, Telegram, atau Google Drive.

---

## 🔒 4 Kunci Agar Semua Rider Terkoneksi Lancar & Suara Terdengar Jelas

Aplikasi ini sudah diprogram dengan optimasi khusus rombongan motor:

1. **Izin Otomatis WebRTC & Mikrofon (`MainActivity.java`)**:
   - Native WebView telah dipasangi penangan `WebChromeClient.onPermissionRequest` otomatis. Saat APK dibuka, WebView langsung memberikan izin mikrofon dan GPS tanpa memicu popup browser yang sering macet di HP Xiaomi, Oppo, Vivo, dan Samsung.

2. **Koneksi Lintas Jaringan (4G/5G/WiFi)**:
   - Signaling Socket.io di dalam APK otomatis mengarah ke cloud server yang aktif, sehingga rider di jaringan Telkomsel, Indosat, XL, maupun Smartfren langsung bertemu di Room ID yang sama.
   - Menggunakan multi-tier STUN/TURN server (Google, Cloudflare, Twilio, Metered) untuk menembus batasan NAT/firewall operator seluler saat di jalan raya.

3. **Anti-Mati di Saku Celana (*Battery & Background Optimizations*)**:
   - Saat rider pertama kali memasang APK, disarankan membuka:
     *Pengaturan HP > Aplikasi > Gibah Berjamaah > Baterai / Penghemat Baterai* > pilih **"Tidak Ada Pembatasan" (No Restrictions)**.
   - Hal ini memastikan Android tidak mematikan audio interkom saat layar HP mati atau saat rider membuka Google Maps.

4. **Klinometer & Spidometer di Holder Motor**:
   - Rider cukup memasang HP di holder setang motor, lalu tekan tombol **"Nolkan / Set Posisi Nol"** pada HUD Cockpit untuk mengkalibrasi kemiringan sesuai sudut holder masing-masing motor.
