# 🏍️ GIBAH BERJAMAAH - STB Armbian Edition
Aplikasi Web Interkom Suara & Peta GPS Real-Time khusus rombongan touring motor.
Dirancang sangat ringan untuk Single Board Computer (STB B860H / HG680P / Raspberry Pi / Orange Pi) dengan Armbian Linux.

---

## 📁 Direktori Aplikasi di STB
Letakkan aplikasi pada path SD Card / Storage sesuai arsitektur:
```bash
/mnt/microsd/apps/uniq-intercom
```

---

## 🚀 Panduan Instalasi di Armbian Linux STB

### 1. Masuk ke direktori aplikasi
```bash
mkdir -p /mnt/microsd/apps/uniq-intercom
cd /mnt/microsd/apps/uniq-intercom
```

### 2. Copy semua file aplikasi ke direktori ini
- `package.json`
- `server.js`
- `public/` (berisi `index.html`, `app.js`, `manifest.json`, `sw.js`)

### 3. Install Dependensi (Hanya Express & Socket.io)
```bash
npm install --production
```

### 4. Uji Jalankan Server
```bash
node server.js
```
Akan muncul log:
```
====================================================
🏍️  GIBAH BERJAMAAH STB SERVER AKTIF
   Port: 3000 (http://localhost:3000)
   Cloudflare Tunnel: Ready
====================================================
```

---

## ⚙️ Pasang Auto-Start systemd (Otomatis Aktif Saat STB Dinyalakan)

Buat file service systemd:
```bash
sudo nano /etc/systemd/system/gibah-intercom.service
```

Isi dengan konfigurasi berikut:
```ini
[Unit]
Description=Gibah Berjamaah Intercom Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/mnt/microsd/apps/uniq-intercom
ExecStart=/usr/bin/node /mnt/microsd/apps/uniq-intercom/server.js
Restart=always
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=gibah-intercom
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Aktifkan service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable gibah-intercom
sudo systemctl start gibah-intercom
sudo systemctl status gibah-intercom
```

---

## 🌐 Konfigurasi Cloudflare Tunnel (HTTPS Akses Publik Tanpa IP Publik)

Karena WebRTC dan Geolocation (GPS) **wajib** menggunakan HTTPS di browser mobile (Chrome & Safari), Cloudflare Tunnel adalah solusi gratis dan terbaik.

1. Install `cloudflared` di Armbian STB:
   ```bash
   sudo apt-get install cloudflared
   ```
2. Login ke akun Cloudflare:
   ```bash
   cloudflared tunnel login
   ```
3. Buat Tunnel dengan nama **"Gibah Berjamaah"**:
   ```bash
   cloudflared tunnel create "Gibah Berjamaah"
   ```
4. Arahkan hostname ke `http://localhost:3000` di file `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: <TUNNEL_ID>
   credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

   ingress:
     - hostname: gibah.namadomainanda.com
       service: http://localhost:3000
     - service: http_status:404
   ```
5. Jalankan tunnel sebagai systemd service:
   ```bash
   sudo cloudflared service install
   sudo systemctl start cloudflared
   ```

Sekarang seluruh rider cukup membuka `https://gibah.namadomainanda.com` di HP masing-masing!

---

## 📱 Tips Baterai & Performa Rider di HP (Android & iOS)

- **Android (Chrome)**: Buka Pengaturan HP > Aplikasi > Chrome > Baterai > Pilih **"Tidak Dibatasi" (Unrestricted)**. Ini menjaga GPS & keep-alive suara tetap berjalan saat HP di saku celana atau tas motor.
- **Helm Bluetooth**: Tombol Play/Pause pada headset intercom helm (Ejeas, Freedconn, Sena) otomatis terhubung ke tombol Mute/PTT melalui Media Session API.
- **Holder Stang**: Gunakan toggle **WakeLock ON** pada aplikasi agar layar navigasi GPS peta tidak mati saat motor melaju.
