# 📱 Panduan Mengunduh & Memasang APK Native "Gibah Berjamaah"

Proyek ini telah dikonversi menjadi **Aplikasi Native Android (Capacitor)** dengan konfigurasi izin hardware lengkap (Bluetooth SCO Headset, Mikrofon, Foreground Service, dan GPS Telemetri).

Berikut 2 cara mudah untuk mendapatkan file `.apk`:

---

### Cara 1: Otomatis via GitHub Actions (Paling Mudah & Rekomendasi)
Anda tidak perlu menginstall software apa pun di komputer!

1. Di pojok kanan atas Google AI Studio, buka menu **Settings** > pilih **Export to GitHub**.
2. Berikan izin dan buat repositori baru (misal: `gibah-berjamaah-intercom`).
3. Begitu kode terkirim ke GitHub Anda:
   - Buka repositori Anda di GitHub.
   - Klik tab **Actions** di menu atas.
   - Anda akan melihat proses build otomatis bernama **"Build Android APK"** sedang berjalan.
   - Setelah selesai (sekitar 2–3 menit), klik workflow tersebut dan unduh file di bagian **Artifacts** bernama:
     👉 **`GibahBerjamaah-Interkom-APK`**
4. Kirim file `.apk` tersebut ke HP Chanz (atau HP rider lain via WhatsApp / Telegram / Google Drive) lalu pasang (Install).

---

### Cara 2: Kompilasi Manual via Android Studio (Jika Punya Laptop)
1. Di AI Studio, buka menu **Settings** > pilih **Download as ZIP**.
2. Ekstrak file ZIP di komputer/laptop Anda.
3. Buka software **Android Studio**, lalu pilih **Open Project** dan arahkan ke folder:
   `folder-ekstrak/android`
4. Tunggu proses *Gradle Sync* selesai.
5. Klik menu atas: **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
6. File `.apk` langsung jadi di folder:
   `android/app/build/outputs/apk/debug/app-debug.apk`
7. Kirim ke HP dan pasang.

---

### Keunggulan Versi Native APK Ini:
1. **Tidak Membisu di Xiaomi / HyperOS / MIUI:** Aplikasi memiliki izin `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, dan `BLUETOOTH_CONNECT` resmi sehingga sistem Android memprioritaskan audio headset helm.
2. **Tidak Dimatikan saat Layar Mati:** Menggunakan izin `FOREGROUND_SERVICE` dan `WAKE_LOCK` sehingga interkom tetap mengudara di saku celana atau saat membuka navigasi peta lain.
3. **Penyambungan Otomatis:** Deteksi pergantian headset Bluetooth langsung direspon oleh driver audio Android tanpa batasan browser web.
