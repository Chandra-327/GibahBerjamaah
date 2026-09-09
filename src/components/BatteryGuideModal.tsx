import React from 'react';
import { BatteryCharging, X, ShieldAlert, CheckCircle2, Smartphone } from 'lucide-react';

interface BatteryGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BatteryGuideModal: React.FC<BatteryGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-950 border border-emerald-500/50">
              <BatteryCharging className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-wide">PENGATURAN BATERAI HP</h2>
              <p className="text-xs text-zinc-400">Agar suara & GPS tetap aktif saat HP di saku</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Urgent Note */}
        <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-600/50 flex gap-3 text-amber-200 text-xs">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong>Penting untuk Touring:</strong> Sistem operasi Android & iOS otomatis mematikan GPS dan mikrofon browser setelah 3 menit layar mati jika baterai disetel ke mode hemat daya.
          </div>
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-3 text-xs text-zinc-300">
          <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800">
            <div className="flex items-center gap-2 font-bold text-white mb-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span>Langkah di Android (Chrome / Edge):</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-zinc-400">
              <li>Tekan & tahan icon <strong>Google Chrome</strong> di homescreen.</li>
              <li>Pilih menu <strong>Info Aplikasi</strong> (App Info / icon huruf ℹ️).</li>
              <li>Gulir ke bawah, pilih menu <strong>Baterai</strong> (Battery).</li>
              <li>Ubah pilihan dari <i>Optimized</i> ke <strong>"Tidak Dibatasi" (Unrestricted)</strong>.</li>
              <li>Pastikan juga opsi <strong>Akses Lokasi (GPS)</strong> diatur ke <i>"Izinkan sepanjang waktu"</i> jika tersedia.</li>
            </ol>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800">
            <div className="flex items-center gap-2 font-bold text-white mb-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span>Untuk Pengguna Xiaomi (MIUI / HyperOS):</span>
            </div>
            <p className="text-zinc-400 leading-relaxed">
              Buka Pengaturan &gt; Aplikasi &gt; Kelola Aplikasi &gt; Chrome &gt; <strong>Penghemat Baterai</strong> &gt; Pilih <strong>"Tidak Ada Pembatasan" (No Restrictions)</strong>. Kunci Chrome di Recent Apps agar tidak ditutup otomatis.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800">
            <div className="flex items-center gap-2 font-bold text-white mb-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span>Untuk Pengguna iPhone (iOS Safari):</span>
            </div>
            <p className="text-zinc-400 leading-relaxed">
              Matikan <strong>Low Power Mode (Mode Daya Rendah)</strong> di Control Center. Di Pengaturan &gt; Safari &gt; Lokasi &gt; pilih <strong>Izinkan</strong>.
            </p>
          </div>
        </div>

        {/* Confirm Button */}
        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-98 shadow-lg shadow-emerald-500/20"
        >
          <CheckCircle2 className="w-5 h-5" />
          <span>SAYA SUDAH MENGERTI & SIAP TOURING</span>
        </button>
      </div>
    </div>
  );
};
