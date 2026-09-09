import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed or standalone, hide
  if (isInstalled) return null;

  return (
    <>
      {isInstallable && (
        <button
          onClick={install}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-zinc-950 font-black text-xs shadow-lg transition-all active:scale-95"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install PWA</span>
        </button>
      )}

      {isIOS && !isInstallable && (
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs border border-zinc-700 transition-all"
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
          <span>Pasang di iOS</span>
        </button>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-700 p-5 shadow-2xl text-white">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
              <h3 className="font-bold text-sm">Pasang di iPhone / iPad</h3>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              1. Buka browser <strong>Safari</strong>.<br />
              2. Tekan tombol <strong>Share</strong> (ikon kotak dengan panah ke atas di bilah bawah).<br />
              3. Gulir ke bawah lalu pilih <strong>Add to Home Screen (Tambahkan ke Layar Utama)</strong>.<br />
              4. Aplikasi Gibah Berjamaah akan muncul di layar seperti aplikasi biasa!
            </p>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-4 w-full rounded-xl bg-zinc-800 py-2.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </>
  );
};
