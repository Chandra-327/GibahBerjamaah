# 🔌 Panduan Pasang Aplikasi ke HP Menggunakan Kabel USB Debugging

Aplikasi **Gibah Berjamaah** ini adalah aplikasi native Android berbasis **Kotlin** (`MainActivity.kt`). Anda dapat langsung memasangnya ke HP Android Anda menggunakan kabel data USB dengan mode **USB Debugging**.

---

## 🛠️ Langkah 1: Aktifkan USB Debugging di HP Android Anda
Jika HP Anda belum mengaktifkan opsi pengembang:

1. Buka **Pengaturan (Settings)** di HP Anda.
2. Pilih **Tentang Ponsel (About Phone)**.
3. Cari tulisan **Nomor Bentukan (Build Number)** atau versi **MIUI / HyperOS Version** (jika HP Xiaomi/Poco):
   - Ketuk 7 kali berturut-turut sampai muncul notifikasi: *"Anda sekarang adalah seorang pengembang!"* (You are now a developer).
4. Kembali ke menu utama Pengaturan > cari **Opsi Pengembang (Developer Options)** (biasanya ada di dalam *Sistem* atau *Setelan Tambahan / Additional Settings*).
5. Aktifkan:
   - ✅ **USB Debugging** (Debugging USB)
   - ✅ *(Khusus Xiaomi/Poco)*: Aktifkan juga **Install via USB** (Instal melalui USB) & **USB Debugging (Security settings)**.

---

## 💻 Langkah 2: Sambungkan HP ke Komputer / Laptop dengan Kabel USB
1. Hubungkan HP ke laptop/PC dengan kabel data USB.
2. Di layar HP, ubah mode koneksi dari "Hanya Mengisi Daya" menjadi **Transfer File (MTP)**.
3. Akan muncul pop-up di layar HP:
   > *"Izinkan proses debug USB dari komputer ini?"*
4. Centang **"Selalu izinkan dari komputer ini"** lalu tekan **OK / Izinkan**.

---

## 🚀 Langkah 3: Pasang Aplikasi ke HP

Ada **2 cara mudah** untuk memasangnya dari komputer Anda:

### Cara A: Menggunakan Android Studio (Paling Visual & Mudah)
1. Unduh proyek ini dari AI Studio:
   - Klik menu **Settings** (pojok kanan atas) > **Download as ZIP**.
2. Ekstrak file ZIP di komputer Anda.
3. Buka aplikasi **Android Studio**, lalu klik **Open Project** dan pilih folder:
   ```
   hasil-ekstrak/android
   ```
4. Tunggu beberapa saat sampai proses *Gradle Sync* selesai.
5. Di bilah atas Android Studio, pastikan nama HP Anda sudah terdeteksi di daftar perangkat (contoh: *Xiaomi 2201116SG* atau *Samsung SM-G998B*).
6. Klik tombol segitiga hijau **▶ (Run App)** atau tekan tombol pintas **Shift + F10**.
7. Aplikasi otomatis dikompilasi (Kotlin) dan langsung terpasang serta terbuka di layar HP Anda! 🎉

---

### Cara B: Menggunakan Terminal / Command Prompt (ADB)
Jika Anda sudah memiliki SDK Android atau ADB di komputer:
1. Buka terminal/cmd di folder hasil ekstrak.
2. Pastikan HP terdeteksi dengan mengetik:
   ```bash
   adb devices
   ```
   *(Akan muncul kode seri HP Anda dengan status `device`)*.
3. Masuk ke folder `android` lalu jalankan perintah instalasi:
   - **Di Windows**:
     ```cmd
     cd android
     gradlew.bat installDebug
     ```
   - **Di Mac / Linux**:
     ```bash
     cd android
     ./gradlew installDebug
     ```
4. Aplikasi otomatis terpasang langsung di HP Anda.

---

## 🌟 Keunggulan Versi Native Kotlin Ini di HP:
1. **Layar Selalu Menyala (WakeLock)**: `MainActivity.kt` telah disetel agar layar tidak mati sendiri saat diletakkan di phone holder motor.
2. **Prioritas Audio Headset Helm**: Izin audio native (`RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, dan `BLUETOOTH_CONNECT`) langsung terpasang di level sistem Android.
3. **Instrumen Klinometer & GPS Presisi**: Sensor giroskop & GPS membaca langsung dari hardware HP tanpa batasan browser.
