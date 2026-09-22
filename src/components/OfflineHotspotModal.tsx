import React, { useState } from 'react';
import { Wifi, Router, Globe, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { HotspotConfig, NetworkConnectionMode } from '../types';

interface OfflineHotspotModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: HotspotConfig;
  onSaveConfig: (newConfig: HotspotConfig) => void;
  isConnected: boolean;
  onReconnectNow?: () => void;
}

export const OfflineHotspotModal: React.FC<OfflineHotspotModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  isConnected,
  onReconnectNow,
}) => {
  const [selectedMode, setSelectedMode] = useState<NetworkConnectionMode>(config.mode);
  const [ipAddress, setIpAddress] = useState<string>(config.hotspotIp);
  const [portNumber, setPortNumber] = useState<number>(config.port || 3000);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const finalIp = ipAddress.trim() || '192.168.43.1';
    const finalPort = portNumber > 0 && portNumber < 65536 ? portNumber : 3000;

    onSaveConfig({
      mode: selectedMode,
      hotspotIp: finalIp,
      port: finalPort,
    });

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
      if (onReconnectNow) {
        onReconnectNow();
      }
    }, 600);
  };

  const handleQuickPreset = (ip: string, port = 3000) => {
    setIpAddress(ip);
    setPortNumber(port);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none animate-fadeIn">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700/80 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 text-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Router className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">Mode Hotspot & Blank Spot</h2>
              <p className="text-[11px] text-zinc-400">Koneksi lokal tanpa kuota internet saat di gunung/hutan</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center text-sm font-bold transition"
          >
            ✕
          </button>
        </div>

        {/* Status Koneksi Saat Ini */}
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-zinc-950/80 border border-zinc-800 text-xs">
          <span className="text-zinc-400 font-medium">Status Interkom:</span>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-ping' : 'bg-red-400 animate-pulse'
              }`}
            />
            <span className={`font-bold font-mono ${isConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isConnected ? 'Terhubung (Online)' : 'Mencari Server...'}
            </span>
          </div>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          {/* Pilihan Mode Jaringan */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Pilih Sumber Sinyal Server:
            </label>
            <div className="grid grid-cols-2 gap-2">
              {/* Option 1: Cloud Normal */}
              <button
                type="button"
                onClick={() => setSelectedMode('CLOUD')}
                className={`p-3 rounded-2xl border-2 text-left flex flex-col gap-1 transition-all ${
                  selectedMode === 'CLOUD'
                    ? 'bg-emerald-950/60 border-emerald-400 text-white shadow-lg shadow-emerald-950/40'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 font-mono">
                    Online
                  </span>
                </div>
                <div className="font-bold text-xs">Cloud Internet</div>
                <div className="text-[10px] text-zinc-400">Jalan raya umum (4G/5G/WiFi Internet)</div>
              </button>

              {/* Option 2: Hotspot Offline */}
              <button
                type="button"
                onClick={() => setSelectedMode('HOTSPOT_LOCAL')}
                className={`p-3 rounded-2xl border-2 text-left flex flex-col gap-1 transition-all ${
                  selectedMode === 'HOTSPOT_LOCAL'
                    ? 'bg-amber-950/60 border-amber-400 text-white shadow-lg shadow-amber-950/40'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Wifi className="w-4 h-4 text-amber-400" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 font-mono">
                    Offline
                  </span>
                </div>
                <div className="font-bold text-xs">Hotspot Lokal / STB</div>
                <div className="text-[10px] text-zinc-400">Blank Spot (Tethering HP / STB tanpa kuota)</div>
              </button>
            </div>
          </div>

          {/* Form IP & Port jika memilih Mode Hotspot Lokal */}
          {selectedMode === 'HOTSPOT_LOCAL' && (
            <div className="p-3.5 rounded-2xl bg-zinc-950/90 border border-amber-500/30 flex flex-col gap-3 animate-fadeIn">
              <div className="flex items-start gap-2 text-xs text-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed text-zinc-300">
                  Semua rider menyambungkan WiFi ke HP Kapten / MiFi yang sama. Masukkan IP server di bawah ini:
                </p>
              </div>

              {/* Preset Buttons */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickPreset('192.168.43.1', 3000)}
                  className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-mono font-bold transition"
                  title="Default IP Tethering Hotspot Android"
                >
                  📱 Hotspot HP Android (192.168.43.1)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickPreset('192.168.1.100', 3000)}
                  className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-mono font-bold transition"
                  title="IP STB / Router MiFi"
                >
                  📡 STB / Router (192.168.1.100)
                </button>
              </div>

              {/* IP Input */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-400">IP Host / Server</label>
                  <input
                    type="text"
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                    placeholder="192.168.43.1"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-mono text-sm focus:outline-none focus:border-amber-400 transition"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-400">Port</label>
                  <input
                    type="number"
                    value={portNumber}
                    onChange={(e) => setPortNumber(parseInt(e.target.value) || 3000)}
                    placeholder="3000"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-mono text-sm focus:outline-none focus:border-amber-400 transition"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Info Nada Alarm Jangkauan */}
          <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 text-[11px] text-zinc-400 flex flex-col gap-1">
            <span className="font-bold text-zinc-300">🔔 Fitur Deteksi Jangkauan & Pemulihan:</span>
            <ul className="list-disc list-inside space-y-0.5 text-zinc-400 text-[10px]">
              <li>Jika motor terpisah &gt; 8 detik, bunyi alarm lembut di helm mengingatkan Anda keluar jangkauan.</li>
              <li>Begitu motor mendekat kembali, sistem otomatis menyambung ulang dengan nada sambut tanpa perlu membuka kunci HP.</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            {onReconnectNow && (
              <button
                type="button"
                onClick={onReconnectNow}
                className="py-3 px-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                title="Paksa Sambung Ulang Sinyal Sekarang"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Re-sync</span>
              </button>
            )}
            <button
              type="submit"
              className={`flex-1 py-3 px-4 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition active:scale-98 ${
                savedSuccess
                  ? 'bg-emerald-500 text-zinc-950'
                  : 'bg-amber-400 hover:bg-amber-300 text-zinc-950 shadow-amber-400/20'
              }`}
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Tersimpan!</span>
                </>
              ) : (
                <span>Terapkan Mode Sinyal</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
